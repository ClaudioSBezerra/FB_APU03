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

	"fb_apu02/services"

	"github.com/golang-jwt/jwt/v5"
)

// ---------------------------------------------------------------------------
// Structs
// ---------------------------------------------------------------------------

type PMAudioNote struct {
	ID                  string    `json:"id"`
	TaskID              string    `json:"task_id"`
	UserID              string    `json:"user_id"`
	UserName            string    `json:"user_name"`
	AudioFilename       string    `json:"audio_filename"`
	AudioURL            string    `json:"audio_url"`
	AudioSizeBytes      int64     `json:"audio_size_bytes"`
	DurationSecs        int       `json:"duration_secs"`
	Transcription       string    `json:"transcription"`
	TranscriptionStatus string    `json:"transcription_status"`
	Observation         string    `json:"observation"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

// ---------------------------------------------------------------------------
// PMAudioHandler — dispatches /api/pm/audio/{note_id}/...
// ---------------------------------------------------------------------------

func PMAudioHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value(ClaimsKey).(jwt.MapClaims)
		if !ok {
			jsonErr(w, http.StatusUnauthorized, "Unauthorized")
			return
		}
		userID := claims["user_id"].(string)

		// /api/pm/audio/{note_id}[/file]
		rest := strings.TrimPrefix(r.URL.Path, "/api/pm/audio/")
		rest = strings.Trim(rest, "/")
		parts := strings.SplitN(rest, "/", 2)

		noteID := parts[0]
		sub := ""
		if len(parts) == 2 {
			sub = parts[1]
		}

		switch sub {
		case "file":
			if r.Method == http.MethodGet {
				pmServeAudioFile(w, r, db, noteID)
			} else {
				jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
			}
		case "":
			switch r.Method {
			case http.MethodPatch:
				pmUpdateAudioObservation(w, r, db, noteID, userID)
			case http.MethodDelete:
				pmDeleteAudioNote(w, db, noteID, userID)
			default:
				jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
			}
		default:
			jsonErr(w, http.StatusNotFound, "Not found")
		}
	}
}

// ---------------------------------------------------------------------------
// List audio notes for a task (called from PMTasksHandler)
// ---------------------------------------------------------------------------

func pmListAudioNotes(w http.ResponseWriter, db *sql.DB, taskID string) {
	rows, err := db.Query(`
		SELECT an.id, an.task_id, an.user_id, COALESCE(u.full_name,''),
		       an.audio_filename, an.audio_path, an.audio_stored_name,
		       COALESCE(an.audio_size_bytes,0), COALESCE(an.duration_secs,0),
		       COALESCE(an.transcription,''), an.transcription_status,
		       COALESCE(an.observation,''), an.created_at, an.updated_at
		FROM pm_task_audio_notes an
		LEFT JOIN users u ON u.id = an.user_id
		WHERE an.task_id = $1
		ORDER BY an.created_at ASC
	`, taskID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	notes := []PMAudioNote{}
	for rows.Next() {
		var n PMAudioNote
		var storedName string
		if err := rows.Scan(&n.ID, &n.TaskID, &n.UserID, &n.UserName,
			&n.AudioFilename, &n.AudioURL, &storedName,
			&n.AudioSizeBytes, &n.DurationSecs,
			&n.Transcription, &n.TranscriptionStatus,
			&n.Observation, &n.CreatedAt, &n.UpdatedAt); err != nil {
			continue
		}
		n.AudioURL = "/api/pm/audio/" + n.ID + "/file"
		notes = append(notes, n)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"audio_notes": notes, "count": len(notes)})
}

// ---------------------------------------------------------------------------
// Upload audio + trigger Z.AI transcription async
// ---------------------------------------------------------------------------

func pmUploadAudioNote(w http.ResponseWriter, r *http.Request, db *sql.DB, taskID, userID string) {
	// max 25MB
	if err := r.ParseMultipartForm(25 << 20); err != nil {
		jsonErr(w, http.StatusBadRequest, "File too large (max 25MB)")
		return
	}

	file, header, err := r.FormFile("audio")
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "audio field required")
		return
	}
	defer file.Close()

	durationSecs := 0
	if d := r.FormValue("duration"); d != "" {
		fmt.Sscanf(d, "%d", &durationSecs)
	}

	// ensure upload directory exists
	uploadDir := filepath.Join("uploads", "pm", "audio", taskID)
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		jsonErr(w, http.StatusInternalServerError, "Cannot create upload dir")
		return
	}

	// generate stored filename
	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".webm"
	}
	storedName := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	storedPath := filepath.Join(uploadDir, storedName)

	// save file
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

	// relative path stored in DB (not absolute)
	relPath := filepath.Join("pm", "audio", taskID)

	// insert with status "processing"
	var noteID string
	err = db.QueryRow(`
		INSERT INTO pm_task_audio_notes
		  (task_id, user_id, audio_filename, audio_stored_name, audio_path,
		   audio_size_bytes, duration_secs, transcription_status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'processing')
		RETURNING id
	`, taskID, userID, header.Filename, storedName, relPath, fileSize, durationSecs).Scan(&noteID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	// get project_id for activity log
	var projectID string
	db.QueryRow(`SELECT project_id FROM pm_tasks WHERE id=$1`, taskID).Scan(&projectID)
	pmLogActivity(db, projectID, taskID, userID, "audio_note_added", "", header.Filename)

	// trigger transcription in background
	go pmTranscribeAudio(db, noteID, storedPath, services.GetZAIAPIKey())

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"id":                   noteID,
		"transcription_status": "processing",
	})
}

// ---------------------------------------------------------------------------
// Z.AI transcription (runs in goroutine)
// ---------------------------------------------------------------------------

func pmTranscribeAudio(db *sql.DB, noteID, audioPath, apiKey string) {
	if apiKey == "" {
		db.Exec(`UPDATE pm_task_audio_notes SET transcription_status='failed',
		         transcription_error='ZAI_API_KEY not configured', updated_at=NOW()
		         WHERE id=$1`, noteID)
		return
	}

	text, err := services.TranscribeAudio(apiKey, audioPath, "pt")
	if err != nil {
		db.Exec(`UPDATE pm_task_audio_notes SET transcription_status='failed',
		         transcription_error=$1, updated_at=NOW() WHERE id=$2`,
			err.Error(), noteID)
		return
	}

	db.Exec(`UPDATE pm_task_audio_notes SET transcription=$1, transcription_status='done',
	         observation=$1, updated_at=NOW() WHERE id=$2`,
		text, noteID)
}

// ---------------------------------------------------------------------------
// Serve audio file (for player)
// ---------------------------------------------------------------------------

func pmServeAudioFile(w http.ResponseWriter, r *http.Request, db *sql.DB, noteID string) {
	var relPath, storedName string
	err := db.QueryRow(`SELECT audio_path, audio_stored_name FROM pm_task_audio_notes WHERE id=$1`,
		noteID).Scan(&relPath, &storedName)
	if err == sql.ErrNoRows {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fullPath := filepath.Join("uploads", relPath, storedName)
	w.Header().Set("Content-Type", "audio/webm")
	w.Header().Set("Accept-Ranges", "bytes")
	http.ServeFile(w, r, fullPath)
}

// ---------------------------------------------------------------------------
// Update observation (user edits transcription before saving)
// ---------------------------------------------------------------------------

func pmUpdateAudioObservation(w http.ResponseWriter, r *http.Request, db *sql.DB, noteID, userID string) {
	var req struct {
		Observation string `json:"observation"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	_, err := db.Exec(`UPDATE pm_task_audio_notes SET observation=$1, updated_at=NOW() WHERE id=$2`,
		req.Observation, noteID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// ---------------------------------------------------------------------------
// Delete audio note + file
// ---------------------------------------------------------------------------

func pmDeleteAudioNote(w http.ResponseWriter, db *sql.DB, noteID, userID string) {
	var relPath, storedName string
	db.QueryRow(`SELECT audio_path, audio_stored_name FROM pm_task_audio_notes WHERE id=$1`,
		noteID).Scan(&relPath, &storedName)

	db.Exec(`DELETE FROM pm_task_audio_notes WHERE id=$1`, noteID)

	// remove file from disk (best effort)
	if storedName != "" {
		os.Remove(filepath.Join("uploads", relPath, storedName))
	}

	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}
