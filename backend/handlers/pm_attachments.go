package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ---------------------------------------------------------------------------
// Structs
// ---------------------------------------------------------------------------

type PMAttachment struct {
	ID          string    `json:"id"`
	TaskID      string    `json:"task_id"`
	UserID      string    `json:"user_id"`
	UserName    string    `json:"user_name"`
	Filename    string    `json:"filename"`
	FileURL     string    `json:"file_url"`
	FileSize    int64     `json:"file_size"`
	MimeType    string    `json:"mime_type"`
	CreatedAt   time.Time `json:"created_at"`
}

// allowed MIME types
var allowedMimeTypes = map[string]bool{
	"application/pdf": true,
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": true,
	"application/vnd.ms-excel":         true,
	"text/csv":                          true,
	"image/png":                         true,
	"image/jpeg":                        true,
	"image/gif":                         true,
	"application/msword":                true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
}

// ---------------------------------------------------------------------------
// PMAttachmentsHandler — dispatches /api/pm/attachments/{att_id}/...
// ---------------------------------------------------------------------------

func PMAttachmentsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value(ClaimsKey).(jwt.MapClaims)
		if !ok {
			jsonErr(w, http.StatusUnauthorized, "Unauthorized")
			return
		}
		userID := claims["user_id"].(string)

		// /api/pm/attachments/{att_id}[/file]
		rest := strings.TrimPrefix(r.URL.Path, "/api/pm/attachments/")
		rest = strings.Trim(rest, "/")
		parts := strings.SplitN(rest, "/", 2)

		attID := parts[0]
		sub := ""
		if len(parts) == 2 {
			sub = parts[1]
		}

		switch sub {
		case "file":
			if r.Method == http.MethodGet {
				pmServeAttachmentFile(w, r, db, attID)
			} else {
				jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
			}
		case "":
			switch r.Method {
			case http.MethodDelete:
				pmDeleteAttachment(w, db, attID, userID)
			default:
				jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
			}
		default:
			jsonErr(w, http.StatusNotFound, "Not found")
		}
	}
}

// ---------------------------------------------------------------------------
// List attachments for a task (called from PMTasksHandler)
// ---------------------------------------------------------------------------

func pmListAttachments(w http.ResponseWriter, db *sql.DB, taskID string) {
	rows, err := db.Query(`
		SELECT a.id, a.task_id, a.user_id, COALESCE(u.full_name,''),
		       a.filename, a.stored_name, a.file_path,
		       COALESCE(a.file_size,0), COALESCE(a.mime_type,''),
		       a.created_at
		FROM pm_task_attachments a
		LEFT JOIN users u ON u.id = a.user_id
		WHERE a.task_id = $1
		ORDER BY a.created_at DESC
	`, taskID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	attachments := []PMAttachment{}
	for rows.Next() {
		var a PMAttachment
		var storedName, filePath string
		if err := rows.Scan(&a.ID, &a.TaskID, &a.UserID, &a.UserName,
			&a.Filename, &storedName, &filePath,
			&a.FileSize, &a.MimeType, &a.CreatedAt); err != nil {
			continue
		}
		a.FileURL = "/api/pm/attachments/" + a.ID + "/file"
		attachments = append(attachments, a)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"attachments": attachments, "count": len(attachments)})
}

// ---------------------------------------------------------------------------
// Upload attachment
// ---------------------------------------------------------------------------

func pmUploadAttachment(w http.ResponseWriter, r *http.Request, db *sql.DB, taskID, userID string) {
	// max 50MB
	if err := r.ParseMultipartForm(50 << 20); err != nil {
		jsonErr(w, http.StatusBadRequest, "File too large (max 50MB)")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "file field required")
		return
	}
	defer file.Close()

	// detect mime type from first 512 bytes
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	mimeType := http.DetectContentType(buf[:n])
	file.Seek(0, 0)

	// also trust extension for office files (DetectContentType can't distinguish xlsx)
	ext := strings.ToLower(filepath.Ext(header.Filename))
	switch ext {
	case ".xlsx":
		mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	case ".xls":
		mimeType = "application/vnd.ms-excel"
	case ".csv":
		mimeType = "text/csv"
	case ".pdf":
		mimeType = "application/pdf"
	case ".doc":
		mimeType = "application/msword"
	case ".docx":
		mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	}

	if !allowedMimeTypes[mimeType] {
		jsonErr(w, http.StatusBadRequest, "File type not allowed. Accepted: PDF, Excel, CSV, Word, PNG, JPG")
		return
	}

	// ensure directory
	uploadDir := filepath.Join("uploads", "pm", "attachments", taskID)
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		jsonErr(w, http.StatusInternalServerError, "Cannot create upload dir")
		return
	}

	storedName := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	storedPath := filepath.Join(uploadDir, storedName)

	dst, err := os.Create(storedPath)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "Cannot save file")
		return
	}
	fileSize, err := io.Copy(dst, file)
	dst.Close()
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "Cannot write file")
		return
	}

	relPath := filepath.Join("pm", "attachments", taskID)

	var attID string
	err = db.QueryRow(`
		INSERT INTO pm_task_attachments (task_id, user_id, filename, stored_name, file_path, file_size, mime_type)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
	`, taskID, userID, header.Filename, storedName, relPath, fileSize, mimeType).Scan(&attID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	var projectID string
	db.QueryRow(`SELECT project_id FROM pm_tasks WHERE id=$1`, taskID).Scan(&projectID)
	pmLogActivity(db, projectID, taskID, userID, "attachment_added", "", header.Filename)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":       attID,
		"filename": header.Filename,
		"mime_type": mimeType,
		"file_url": "/api/pm/attachments/" + attID + "/file",
	})
}

// ---------------------------------------------------------------------------
// Serve attachment file
// ---------------------------------------------------------------------------

func pmServeAttachmentFile(w http.ResponseWriter, r *http.Request, db *sql.DB, attID string) {
	var relPath, storedName, filename, mimeType string
	err := db.QueryRow(`SELECT file_path, stored_name, filename, COALESCE(mime_type,'application/octet-stream')
		FROM pm_task_attachments WHERE id=$1`, attID).Scan(&relPath, &storedName, &filename, &mimeType)
	if err == sql.ErrNoRows {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fullPath := filepath.Join("uploads", relPath, storedName)
	w.Header().Set("Content-Type", mimeType)
	// inline for PDF/images, attachment for others
	if mimeType == "application/pdf" || strings.HasPrefix(mimeType, "image/") {
		w.Header().Set("Content-Disposition", "inline; filename=\""+filename+"\"")
	} else {
		w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	}
	http.ServeFile(w, r, fullPath)
}

// ---------------------------------------------------------------------------
// Delete attachment
// ---------------------------------------------------------------------------

func pmDeleteAttachment(w http.ResponseWriter, db *sql.DB, attID, userID string) {
	var relPath, storedName string
	db.QueryRow(`SELECT file_path, stored_name FROM pm_task_attachments WHERE id=$1`,
		attID).Scan(&relPath, &storedName)

	db.Exec(`DELETE FROM pm_task_attachments WHERE id=$1`, attID)

	if storedName != "" {
		os.Remove(filepath.Join("uploads", relPath, storedName))
	}

	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}
