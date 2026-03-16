package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ---------------------------------------------------------------------------
// Structs
// ---------------------------------------------------------------------------

type PMTask struct {
	ID          string     `json:"id"`
	ProjectID   string     `json:"project_id"`
	PhaseID     *string    `json:"phase_id"`
	SprintID    *string    `json:"sprint_id"`
	EpicID      *string    `json:"epic_id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Status      string     `json:"status"`
	Priority    string     `json:"priority"`
	Type        string     `json:"type"`
	AssignedTo  *string    `json:"assigned_to"`
	AssigneeName string    `json:"assignee_name"`
	ReporterID  *string    `json:"reporter_id"`
	ReporterName string    `json:"reporter_name"`
	StoryPoints *int       `json:"story_points"`
	DueDate     *string    `json:"due_date"`
	OrderIndex  int        `json:"order_index"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	ResolvedAt  *time.Time `json:"resolved_at"`
	// extra counts
	CommentCount    int `json:"comment_count,omitempty"`
	AttachmentCount int `json:"attachment_count,omitempty"`
	AudioCount      int `json:"audio_count,omitempty"`
}

// ---------------------------------------------------------------------------
// PMTasksHandler — dispatches /api/pm/tasks/{id}/...
// ---------------------------------------------------------------------------

func PMTasksHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value(ClaimsKey).(jwt.MapClaims)
		if !ok {
			jsonErr(w, http.StatusUnauthorized, "Unauthorized")
			return
		}
		userID := claims["user_id"].(string)

		// /api/pm/tasks/{id}[/{sub}]
		rest := strings.TrimPrefix(r.URL.Path, "/api/pm/tasks/")
		rest = strings.Trim(rest, "/")
		parts := strings.SplitN(rest, "/", 2)

		taskID := parts[0]
		if taskID == "" {
			jsonErr(w, http.StatusBadRequest, "task id required")
			return
		}

		sub := ""
		if len(parts) == 2 {
			sub = parts[1]
		}

		switch sub {
		case "":
			switch r.Method {
			case http.MethodGet:
				pmGetTask(w, db, taskID)
			case http.MethodPut, http.MethodPatch:
				pmUpdateTask(w, r, db, taskID, userID)
			case http.MethodDelete:
				pmDeleteTask(w, db, taskID, userID)
			default:
				jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
			}
		case "status":
			if r.Method == http.MethodPatch {
				globalRole, _ := claims["role"].(string)
				pmMoveTaskStatus(w, r, db, taskID, userID, globalRole)
			} else {
				jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
			}
		case "comments":
			switch r.Method {
			case http.MethodGet:
				pmListComments(w, db, taskID)
			case http.MethodPost:
				pmCreateComment(w, r, db, taskID, userID)
			default:
				jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
			}
		case "audio":
			switch r.Method {
			case http.MethodGet:
				pmListAudioNotes(w, db, taskID)
			case http.MethodPost:
				pmUploadAudioNote(w, r, db, taskID, userID)
			default:
				jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
			}
		case "attachments":
			switch r.Method {
			case http.MethodGet:
				pmListAttachments(w, db, taskID)
			case http.MethodPost:
				pmUploadAttachment(w, r, db, taskID, userID)
			default:
				jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
			}
		default:
			jsonErr(w, http.StatusNotFound, "Not found")
		}
	}
}

// ---------------------------------------------------------------------------
// List tasks for a project (called from PMProjectsHandler)
// ---------------------------------------------------------------------------

func pmListTasks(w http.ResponseWriter, r *http.Request, db *sql.DB, projectID, companyID string) {
	// optional filters
	q := r.URL.Query()
	status := q.Get("status")
	sprintID := q.Get("sprint_id")
	phaseID := q.Get("phase_id")
	assignedTo := q.Get("assigned_to")

	query := `
		SELECT t.id, t.project_id, t.phase_id, t.sprint_id, t.epic_id,
		       t.title, COALESCE(t.description,''), t.status, t.priority, t.type,
		       t.assigned_to, COALESCE(ua.full_name,''),
		       t.reporter_id, COALESCE(ur.full_name,''),
		       t.story_points, to_char(t.due_date,'YYYY-MM-DD'),
		       t.order_index, t.created_at, t.updated_at, t.resolved_at,
		       (SELECT COUNT(*) FROM pm_task_comments c WHERE c.task_id = t.id),
		       (SELECT COUNT(*) FROM pm_task_attachments a WHERE a.task_id = t.id),
		       (SELECT COUNT(*) FROM pm_task_audio_notes an WHERE an.task_id = t.id)
		FROM pm_tasks t
		LEFT JOIN users ua ON ua.id = t.assigned_to
		LEFT JOIN users ur ON ur.id = t.reporter_id
		WHERE t.project_id = $1
	`
	args := []interface{}{projectID}
	idx := 2

	if status != "" {
		query += " AND t.status = $" + pmItoa(idx)
		args = append(args, status)
		idx++
	}
	if sprintID != "" {
		query += " AND t.sprint_id = $" + pmItoa(idx)
		args = append(args, sprintID)
		idx++
	}
	if phaseID != "" {
		query += " AND t.phase_id = $" + pmItoa(idx)
		args = append(args, phaseID)
		idx++
	}
	if assignedTo != "" {
		query += " AND t.assigned_to = $" + pmItoa(idx)
		args = append(args, assignedTo)
		idx++
	}
	_ = idx

	query += " ORDER BY t.status, t.order_index ASC, t.created_at ASC"

	rows, err := db.Query(query, args...)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	tasks := []PMTask{}
	for rows.Next() {
		t := scanTask(rows)
		if t == nil {
			continue
		}
		tasks = append(tasks, *t)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"tasks": tasks, "count": len(tasks)})
}

// ---------------------------------------------------------------------------
// Task CRUD
// ---------------------------------------------------------------------------

func pmGetTask(w http.ResponseWriter, db *sql.DB, taskID string) {
	row := db.QueryRow(`
		SELECT t.id, t.project_id, t.phase_id, t.sprint_id, t.epic_id,
		       t.title, COALESCE(t.description,''), t.status, t.priority, t.type,
		       t.assigned_to, COALESCE(ua.full_name,''),
		       t.reporter_id, COALESCE(ur.full_name,''),
		       t.story_points, to_char(t.due_date,'YYYY-MM-DD'),
		       t.order_index, t.created_at, t.updated_at, t.resolved_at,
		       (SELECT COUNT(*) FROM pm_task_comments c WHERE c.task_id = t.id),
		       (SELECT COUNT(*) FROM pm_task_attachments a WHERE a.task_id = t.id),
		       (SELECT COUNT(*) FROM pm_task_audio_notes an WHERE an.task_id = t.id)
		FROM pm_tasks t
		LEFT JOIN users ua ON ua.id = t.assigned_to
		LEFT JOIN users ur ON ur.id = t.reporter_id
		WHERE t.id = $1
	`, taskID)
	t := scanTask(row)
	if t == nil {
		jsonErr(w, http.StatusNotFound, "Task not found")
		return
	}
	json.NewEncoder(w).Encode(t)
}

func pmCreateTask(w http.ResponseWriter, r *http.Request, db *sql.DB, projectID, companyID, userID string) {
	var req struct {
		Title       string  `json:"title"`
		Description string  `json:"description"`
		Status      string  `json:"status"`
		Priority    string  `json:"priority"`
		Type        string  `json:"type"`
		PhaseID     *string `json:"phase_id"`
		SprintID    *string `json:"sprint_id"`
		EpicID      *string `json:"epic_id"`
		AssignedTo  *string `json:"assigned_to"`
		StoryPoints *int    `json:"story_points"`
		DueDate     *string `json:"due_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	if strings.TrimSpace(req.Title) == "" {
		jsonErr(w, http.StatusBadRequest, "title is required")
		return
	}
	if req.Status == "" {
		req.Status = "backlog"
	}
	if req.Priority == "" {
		req.Priority = "medium"
	}
	if req.Type == "" {
		req.Type = "task"
	}

	var maxOrder int
	db.QueryRow(`SELECT COALESCE(MAX(order_index),0) FROM pm_tasks WHERE project_id=$1 AND status=$2`,
		projectID, req.Status).Scan(&maxOrder)

	var id string
	err := db.QueryRow(`
		INSERT INTO pm_tasks
		  (project_id, phase_id, sprint_id, epic_id, title, description, status, priority, type,
		   assigned_to, reporter_id, story_points, due_date, order_index)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
		RETURNING id
	`, projectID, req.PhaseID, req.SprintID, req.EpicID, req.Title, req.Description,
		req.Status, req.Priority, req.Type,
		req.AssignedTo, userID, req.StoryPoints, req.DueDate, maxOrder+1).Scan(&id)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	pmLogActivity(db, projectID, id, userID, "task_created", "", req.Title)
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": id})
}

func pmUpdateTask(w http.ResponseWriter, r *http.Request, db *sql.DB, taskID, userID string) {
	var req struct {
		Title       string  `json:"title"`
		Description string  `json:"description"`
		Status      string  `json:"status"`
		Priority    string  `json:"priority"`
		Type        string  `json:"type"`
		PhaseID     *string `json:"phase_id"`
		SprintID    *string `json:"sprint_id"`
		EpicID      *string `json:"epic_id"`
		AssignedTo  *string `json:"assigned_to"`
		StoryPoints *int    `json:"story_points"`
		DueDate     *string `json:"due_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}

	// get project_id for activity log
	var projectID string
	db.QueryRow(`SELECT project_id FROM pm_tasks WHERE id=$1`, taskID).Scan(&projectID)

	_, err := db.Exec(`
		UPDATE pm_tasks SET
		  title=$1, description=$2, status=$3, priority=$4, type=$5,
		  phase_id=$6, sprint_id=$7, epic_id=$8, assigned_to=$9, story_points=$10, due_date=$11,
		  updated_at=NOW()
		WHERE id=$12
	`, req.Title, req.Description, req.Status, req.Priority, req.Type,
		req.PhaseID, req.SprintID, req.EpicID, req.AssignedTo, req.StoryPoints, req.DueDate, taskID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	pmLogActivity(db, projectID, taskID, userID, "task_updated", "", req.Title)
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func pmDeleteTask(w http.ResponseWriter, db *sql.DB, taskID, userID string) {
	var projectID string
	db.QueryRow(`SELECT project_id FROM pm_tasks WHERE id=$1`, taskID).Scan(&projectID)
	db.Exec(`DELETE FROM pm_tasks WHERE id=$1`, taskID)
	pmLogActivity(db, projectID, "", userID, "task_deleted", taskID, "")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// PATCH /api/pm/tasks/{id}/status
func pmMoveTaskStatus(w http.ResponseWriter, r *http.Request, db *sql.DB, taskID, userID, globalRole string) {
	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	validStatuses := map[string]bool{
		"backlog": true, "todo": true, "in_progress": true,
		"review": true, "done": true, "blocked": true, "cancelled": true,
	}
	if !validStatuses[req.Status] {
		jsonErr(w, http.StatusBadRequest, "Invalid status")
		return
	}

	var oldStatus, projectID string
	db.QueryRow(`SELECT status, project_id FROM pm_tasks WHERE id=$1`, taskID).Scan(&oldStatus, &projectID)

	// "cancelled" só pode ser definido por admin global ou pm/po no projeto
	if req.Status == "cancelled" {
		if globalRole != "admin" {
			var memberRole string
			err := db.QueryRow(`
				SELECT role FROM pm_project_members
				WHERE project_id=$1 AND user_id=$2
			`, projectID, userID).Scan(&memberRole)
			if err != nil || (memberRole != "pm" && memberRole != "po") {
				jsonErr(w, http.StatusForbidden, "Apenas PM, PO ou admin podem cancelar tarefas")
				return
			}
		}
	}

	resolvedAt := "NULL"
	if req.Status == "done" {
		resolvedAt = "NOW()"
	}
	_ = resolvedAt

	var err error
	if req.Status == "done" || req.Status == "cancelled" {
		_, err = db.Exec(`UPDATE pm_tasks SET status=$1, updated_at=NOW(), resolved_at=NOW() WHERE id=$2`,
			req.Status, taskID)
	} else {
		_, err = db.Exec(`UPDATE pm_tasks SET status=$1, updated_at=NOW(), resolved_at=NULL WHERE id=$2`,
			req.Status, taskID)
	}
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	pmLogActivity(db, projectID, taskID, userID, "task_moved", oldStatus, req.Status)
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

type PMComment struct {
	ID        string    `json:"id"`
	TaskID    string    `json:"task_id"`
	UserID    string    `json:"user_id"`
	UserName  string    `json:"user_name"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func pmListComments(w http.ResponseWriter, db *sql.DB, taskID string) {
	rows, err := db.Query(`
		SELECT c.id, c.task_id, c.user_id, COALESCE(u.full_name,''),
		       c.content, c.created_at, c.updated_at
		FROM pm_task_comments c
		LEFT JOIN users u ON u.id = c.user_id
		WHERE c.task_id = $1
		ORDER BY c.created_at ASC
	`, taskID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	comments := []PMComment{}
	for rows.Next() {
		var c PMComment
		if err := rows.Scan(&c.ID, &c.TaskID, &c.UserID, &c.UserName,
			&c.Content, &c.CreatedAt, &c.UpdatedAt); err != nil {
			continue
		}
		comments = append(comments, c)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"comments": comments})
}

func pmCreateComment(w http.ResponseWriter, r *http.Request, db *sql.DB, taskID, userID string) {
	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	if strings.TrimSpace(req.Content) == "" {
		jsonErr(w, http.StatusBadRequest, "content is required")
		return
	}

	var id string
	err := db.QueryRow(`
		INSERT INTO pm_task_comments (task_id, user_id, content) VALUES ($1,$2,$3) RETURNING id
	`, taskID, userID, req.Content).Scan(&id)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	var projectID string
	db.QueryRow(`SELECT project_id FROM pm_tasks WHERE id=$1`, taskID).Scan(&projectID)
	pmLogActivity(db, projectID, taskID, userID, "comment_added", "", req.Content)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": id})
}

// ---------------------------------------------------------------------------
// Dashboard data (called from PMProjectsHandler)
// ---------------------------------------------------------------------------

type PMDashboard struct {
	TasksByStatus   []PMCountByKey `json:"tasks_by_status"`
	TasksByPriority []PMCountByKey `json:"tasks_by_priority"`
	TasksByType     []PMCountByKey `json:"tasks_by_type"`
	TasksByAssignee []PMCountByKey `json:"tasks_by_assignee"`
	TotalTasks      int            `json:"total_tasks"`
	DoneTasks       int            `json:"done_tasks"`
	InProgressTasks int            `json:"in_progress_tasks"`
	BlockedTasks    int            `json:"blocked_tasks"`
	OverdueTasks    int            `json:"overdue_tasks"`
	ProgressPct     int            `json:"progress_pct"`
}

type PMCountByKey struct {
	Key   string `json:"key"`
	Count int    `json:"count"`
}

func pmGetDashboard(w http.ResponseWriter, db *sql.DB, projectID, companyID string) {
	var dash PMDashboard

	// verify company
	var exists bool
	db.QueryRow(`SELECT EXISTS(SELECT 1 FROM pm_projects WHERE id=$1 AND company_id=$2)`, projectID, companyID).Scan(&exists)
	if !exists {
		jsonErr(w, http.StatusNotFound, "Project not found")
		return
	}

	// tasks by status
	rows, _ := db.Query(`SELECT status, COUNT(*) FROM pm_tasks WHERE project_id=$1 GROUP BY status`, projectID)
	if rows != nil {
		for rows.Next() {
			var k PMCountByKey
			rows.Scan(&k.Key, &k.Count)
			dash.TasksByStatus = append(dash.TasksByStatus, k)
			dash.TotalTasks += k.Count
			switch k.Key {
			case "done":
				dash.DoneTasks = k.Count
			case "in_progress":
				dash.InProgressTasks = k.Count
			case "blocked":
				dash.BlockedTasks = k.Count
			}
		}
		rows.Close()
	}

	// tasks by priority
	rows, _ = db.Query(`SELECT priority, COUNT(*) FROM pm_tasks WHERE project_id=$1 GROUP BY priority ORDER BY COUNT(*) DESC`, projectID)
	if rows != nil {
		for rows.Next() {
			var k PMCountByKey
			rows.Scan(&k.Key, &k.Count)
			dash.TasksByPriority = append(dash.TasksByPriority, k)
		}
		rows.Close()
	}

	// tasks by type
	rows, _ = db.Query(`SELECT type, COUNT(*) FROM pm_tasks WHERE project_id=$1 GROUP BY type ORDER BY COUNT(*) DESC`, projectID)
	if rows != nil {
		for rows.Next() {
			var k PMCountByKey
			rows.Scan(&k.Key, &k.Count)
			dash.TasksByType = append(dash.TasksByType, k)
		}
		rows.Close()
	}

	// tasks by assignee
	rows, _ = db.Query(`
		SELECT COALESCE(u.full_name,'Sem responsável'), COUNT(*)
		FROM pm_tasks t
		LEFT JOIN users u ON u.id = t.assigned_to
		WHERE t.project_id=$1
		GROUP BY COALESCE(u.full_name,'Sem responsável')
		ORDER BY COUNT(*) DESC
		LIMIT 10
	`, projectID)
	if rows != nil {
		for rows.Next() {
			var k PMCountByKey
			rows.Scan(&k.Key, &k.Count)
			dash.TasksByAssignee = append(dash.TasksByAssignee, k)
		}
		rows.Close()
	}

	// overdue
	db.QueryRow(`
		SELECT COUNT(*) FROM pm_tasks
		WHERE project_id=$1 AND due_date < CURRENT_DATE AND status != 'done'
	`, projectID).Scan(&dash.OverdueTasks)

	if dash.TotalTasks > 0 {
		dash.ProgressPct = (dash.DoneTasks * 100) / dash.TotalTasks
	}

	json.NewEncoder(w).Encode(dash)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// rowScanner allows both *sql.Row and *sql.Rows to be passed to scanTask.
type rowScanner interface {
	Scan(dest ...interface{}) error
}

func scanTask(row rowScanner) *PMTask {
	var t PMTask
	var pid, sid, eid, at, rid sql.NullString
	var sp sql.NullInt64
	var dd sql.NullString
	var ra sql.NullTime
	err := row.Scan(
		&t.ID, &t.ProjectID, &pid, &sid, &eid,
		&t.Title, &t.Description, &t.Status, &t.Priority, &t.Type,
		&at, &t.AssigneeName,
		&rid, &t.ReporterName,
		&sp, &dd,
		&t.OrderIndex, &t.CreatedAt, &t.UpdatedAt, &ra,
		&t.CommentCount, &t.AttachmentCount, &t.AudioCount,
	)
	if err != nil {
		return nil
	}
	if pid.Valid {
		t.PhaseID = &pid.String
	}
	if sid.Valid {
		t.SprintID = &sid.String
	}
	if eid.Valid {
		t.EpicID = &eid.String
	}
	if at.Valid {
		t.AssignedTo = &at.String
	}
	if rid.Valid {
		t.ReporterID = &rid.String
	}
	if sp.Valid {
		v := int(sp.Int64)
		t.StoryPoints = &v
	}
	if dd.Valid {
		t.DueDate = &dd.String
	}
	if ra.Valid {
		t.ResolvedAt = &ra.Time
	}
	return &t
}

func pmItoa(i int) string {
	return strconv.Itoa(i)
}
