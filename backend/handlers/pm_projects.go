package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ---------------------------------------------------------------------------
// Structs
// ---------------------------------------------------------------------------

type PMProject struct {
	ID          string     `json:"id"`
	CompanyID   string     `json:"company_id"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Status      string     `json:"status"`
	Type        string     `json:"type"`
	StartDate   *string    `json:"start_date"`
	EndDate     *string    `json:"end_date"`
	CreatedBy   *string    `json:"created_by"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	// computed
	MemberCount int `json:"member_count,omitempty"`
	TaskCount   int `json:"task_count,omitempty"`
	DoneCount   int `json:"done_count,omitempty"`
}

type PMProjectMember struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"project_id"`
	UserID    string    `json:"user_id"`
	Role      string    `json:"role"`
	JoinedAt  time.Time `json:"joined_at"`
	// joined from users
	FullName string `json:"full_name"`
	Email    string `json:"email"`
}

// ---------------------------------------------------------------------------
// PMProjectsHandler — dispatches /api/pm/projects and /api/pm/projects/...
// ---------------------------------------------------------------------------

func PMProjectsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value(ClaimsKey).(jwt.MapClaims)
		if !ok {
			jsonErr(w, http.StatusUnauthorized, "Unauthorized")
			return
		}
		userID := claims["user_id"].(string)

		companyID, err := GetEffectiveCompanyID(db, userID, r.Header.Get("X-Company-ID"))
		if err != nil {
			jsonErr(w, http.StatusInternalServerError, "Error getting company: "+err.Error())
			return
		}

		// parse path: /api/pm/projects[/{id}[/{sub}[/{subid}]]]
		rest := strings.TrimPrefix(r.URL.Path, "/api/pm/projects")
		rest = strings.Trim(rest, "/")
		parts := []string{}
		if rest != "" {
			parts = strings.SplitN(rest, "/", 4)
		}

		switch len(parts) {
		case 0:
			// /api/pm/projects
			switch r.Method {
			case http.MethodGet:
				pmListProjects(w, r, db, companyID)
			case http.MethodPost:
				pmCreateProject(w, r, db, companyID, userID)
			default:
				jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
			}

		case 1:
			// /api/pm/projects/{id}
			projectID := parts[0]
			switch r.Method {
			case http.MethodGet:
				pmGetProject(w, r, db, projectID, companyID)
			case http.MethodPut, http.MethodPatch:
				pmUpdateProject(w, r, db, projectID, companyID)
			case http.MethodDelete:
				pmDeleteProject(w, r, db, projectID, companyID)
			default:
				jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
			}

		case 2:
			projectID := parts[0]
			sub := parts[1]
			switch sub {
			case "members":
				switch r.Method {
				case http.MethodGet:
					pmListMembers(w, r, db, projectID, companyID)
				case http.MethodPost:
					pmAddMember(w, r, db, projectID, companyID)
				default:
					jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
				}
			case "phases":
				switch r.Method {
				case http.MethodGet:
					pmListPhases(w, db, projectID, companyID)
				case http.MethodPost:
					pmCreatePhase(w, r, db, projectID, companyID)
				default:
					jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
				}
			case "sprints":
				switch r.Method {
				case http.MethodGet:
					pmListSprints(w, db, projectID, companyID)
				case http.MethodPost:
					pmCreateSprint(w, r, db, projectID, companyID)
				default:
					jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
				}
			case "tasks":
				switch r.Method {
				case http.MethodGet:
					pmListTasks(w, r, db, projectID, companyID)
				case http.MethodPost:
					pmCreateTask(w, r, db, projectID, companyID, userID)
				default:
					jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
				}
			case "dashboard":
				if r.Method == http.MethodGet {
					pmGetDashboard(w, db, projectID, companyID)
				} else {
					jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
				}
			case "activity":
				if r.Method == http.MethodGet {
					pmListActivity(w, r, db, projectID, companyID)
				} else {
					jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
				}
			case "export":
				jsonErr(w, http.StatusNotFound, "Use /export/tasks")
			default:
				jsonErr(w, http.StatusNotFound, "Not found")
			}

		case 3:
			projectID := parts[0]
			sub := parts[1]
			subID := parts[2]
			// /api/pm/projects/{id}/members/{uid}
			if sub == "members" && r.Method == http.MethodDelete {
				pmRemoveMember(w, r, db, projectID, subID, companyID)
				return
			}
			// /api/pm/projects/{id}/export/tasks
			if sub == "export" && subID == "tasks" && r.Method == http.MethodGet {
				pmExportTasksExcel(w, r, db, projectID, companyID)
				return
			}
			// /api/pm/projects/{id}/phases/{pid}
			if sub == "phases" {
				switch r.Method {
				case http.MethodPut, http.MethodPatch:
					pmUpdatePhase(w, r, db, subID, companyID)
				case http.MethodDelete:
					pmDeletePhase(w, db, subID, companyID)
				default:
					jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
				}
				return
			}
			// /api/pm/projects/{id}/sprints/{sid}
			if sub == "sprints" {
				switch r.Method {
				case http.MethodPut, http.MethodPatch:
					pmUpdateSprint(w, r, db, subID, companyID)
				case http.MethodDelete:
					pmDeleteSprint(w, db, subID, companyID)
				default:
					jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
				}
				return
			}
			_ = projectID
			jsonErr(w, http.StatusNotFound, "Not found")
		default:
			jsonErr(w, http.StatusNotFound, "Not found")
		}
	}
}

// ---------------------------------------------------------------------------
// Projects CRUD
// ---------------------------------------------------------------------------

func pmListProjects(w http.ResponseWriter, r *http.Request, db *sql.DB, companyID string) {
	rows, err := db.Query(`
		SELECT p.id, p.company_id, p.name, COALESCE(p.description,''), p.status, p.type,
		       to_char(p.start_date,'YYYY-MM-DD'), to_char(p.end_date,'YYYY-MM-DD'),
		       p.created_by, p.created_at, p.updated_at,
		       COUNT(DISTINCT m.id) AS member_count,
		       COUNT(DISTINCT t.id) AS task_count,
		       COUNT(DISTINCT t2.id) AS done_count
		FROM pm_projects p
		LEFT JOIN pm_project_members m ON m.project_id = p.id
		LEFT JOIN pm_tasks t ON t.project_id = p.id
		LEFT JOIN pm_tasks t2 ON t2.project_id = p.id AND t2.status = 'done'
		WHERE p.company_id = $1
		GROUP BY p.id
		ORDER BY p.created_at DESC
	`, companyID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	projects := []PMProject{}
	for rows.Next() {
		var p PMProject
		var sd, ed sql.NullString
		var cb sql.NullString
		if err := rows.Scan(&p.ID, &p.CompanyID, &p.Name, &p.Description, &p.Status, &p.Type,
			&sd, &ed, &cb, &p.CreatedAt, &p.UpdatedAt,
			&p.MemberCount, &p.TaskCount, &p.DoneCount); err != nil {
			jsonErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		if sd.Valid {
			p.StartDate = &sd.String
		}
		if ed.Valid {
			p.EndDate = &ed.String
		}
		if cb.Valid {
			p.CreatedBy = &cb.String
		}
		projects = append(projects, p)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"projects": projects, "count": len(projects)})
}

func pmCreateProject(w http.ResponseWriter, r *http.Request, db *sql.DB, companyID, userID string) {
	var req struct {
		Name        string  `json:"name"`
		Description string  `json:"description"`
		Status      string  `json:"status"`
		Type        string  `json:"type"`
		StartDate   *string `json:"start_date"`
		EndDate     *string `json:"end_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		jsonErr(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Status == "" {
		req.Status = "planning"
	}
	if req.Type == "" {
		req.Type = "sap_implementation"
	}

	var id string
	err := db.QueryRow(`
		INSERT INTO pm_projects (company_id, name, description, status, type, start_date, end_date, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
	`, companyID, req.Name, req.Description, req.Status, req.Type, req.StartDate, req.EndDate, userID).Scan(&id)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	// auto-add creator as PM
	db.Exec(`INSERT INTO pm_project_members (project_id, user_id, role) VALUES ($1,$2,'pm')`, id, userID)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": id})
}

func pmGetProject(w http.ResponseWriter, r *http.Request, db *sql.DB, projectID, companyID string) {
	var p PMProject
	var sd, ed sql.NullString
	var cb sql.NullString
	err := db.QueryRow(`
		SELECT p.id, p.company_id, p.name, COALESCE(p.description,''), p.status, p.type,
		       to_char(p.start_date,'YYYY-MM-DD'), to_char(p.end_date,'YYYY-MM-DD'),
		       p.created_by, p.created_at, p.updated_at
		FROM pm_projects p
		WHERE p.id = $1 AND p.company_id = $2
	`, projectID, companyID).Scan(
		&p.ID, &p.CompanyID, &p.Name, &p.Description, &p.Status, &p.Type,
		&sd, &ed, &cb, &p.CreatedAt, &p.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		jsonErr(w, http.StatusNotFound, "Project not found")
		return
	}
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if sd.Valid {
		p.StartDate = &sd.String
	}
	if ed.Valid {
		p.EndDate = &ed.String
	}
	if cb.Valid {
		p.CreatedBy = &cb.String
	}
	json.NewEncoder(w).Encode(p)
}

func pmUpdateProject(w http.ResponseWriter, r *http.Request, db *sql.DB, projectID, companyID string) {
	var req struct {
		Name        string  `json:"name"`
		Description string  `json:"description"`
		Status      string  `json:"status"`
		Type        string  `json:"type"`
		StartDate   *string `json:"start_date"`
		EndDate     *string `json:"end_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	_, err := db.Exec(`
		UPDATE pm_projects SET name=$1, description=$2, status=$3, type=$4,
		       start_date=$5, end_date=$6, updated_at=NOW()
		WHERE id=$7 AND company_id=$8
	`, req.Name, req.Description, req.Status, req.Type, req.StartDate, req.EndDate, projectID, companyID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func pmDeleteProject(w http.ResponseWriter, r *http.Request, db *sql.DB, projectID, companyID string) {
	_, err := db.Exec(`DELETE FROM pm_projects WHERE id=$1 AND company_id=$2`, projectID, companyID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

func pmListMembers(w http.ResponseWriter, r *http.Request, db *sql.DB, projectID, companyID string) {
	rows, err := db.Query(`
		SELECT m.id, m.project_id, m.user_id, m.role, m.joined_at,
		       u.full_name, u.email
		FROM pm_project_members m
		JOIN users u ON u.id = m.user_id
		JOIN pm_projects p ON p.id = m.project_id
		WHERE m.project_id = $1 AND p.company_id = $2
		ORDER BY m.joined_at ASC
	`, projectID, companyID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	members := []PMProjectMember{}
	for rows.Next() {
		var m PMProjectMember
		if err := rows.Scan(&m.ID, &m.ProjectID, &m.UserID, &m.Role, &m.JoinedAt, &m.FullName, &m.Email); err != nil {
			jsonErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		members = append(members, m)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"members": members, "count": len(members)})
}

func pmAddMember(w http.ResponseWriter, r *http.Request, db *sql.DB, projectID, companyID string) {
	var req struct {
		UserID string `json:"user_id"`
		Role   string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	if req.UserID == "" {
		jsonErr(w, http.StatusBadRequest, "user_id is required")
		return
	}
	if req.Role == "" {
		req.Role = "developer"
	}

	// verify project belongs to company
	var exists bool
	db.QueryRow(`SELECT EXISTS(SELECT 1 FROM pm_projects WHERE id=$1 AND company_id=$2)`, projectID, companyID).Scan(&exists)
	if !exists {
		jsonErr(w, http.StatusNotFound, "Project not found")
		return
	}

	var id string
	err := db.QueryRow(`
		INSERT INTO pm_project_members (project_id, user_id, role)
		VALUES ($1,$2,$3)
		ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role
		RETURNING id
	`, projectID, req.UserID, req.Role).Scan(&id)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	pmLogActivity(db, projectID, "", req.UserID, "member_added", "", req.Role)
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": id})
}

func pmRemoveMember(w http.ResponseWriter, r *http.Request, db *sql.DB, projectID, memberUserID, companyID string) {
	var exists bool
	db.QueryRow(`SELECT EXISTS(SELECT 1 FROM pm_projects WHERE id=$1 AND company_id=$2)`, projectID, companyID).Scan(&exists)
	if !exists {
		jsonErr(w, http.StatusNotFound, "Project not found")
		return
	}
	db.Exec(`DELETE FROM pm_project_members WHERE project_id=$1 AND user_id=$2`, projectID, memberUserID)
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

type PMPhase struct {
	ID          string  `json:"id"`
	ProjectID   string  `json:"project_id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	OrderIndex  int     `json:"order_index"`
	Status      string  `json:"status"`
	Color       string  `json:"color"`
	StartDate   *string `json:"start_date"`
	EndDate     *string `json:"end_date"`
}

func pmListPhases(w http.ResponseWriter, db *sql.DB, projectID, companyID string) {
	rows, err := db.Query(`
		SELECT ph.id, ph.project_id, ph.name, COALESCE(ph.description,''), ph.order_index,
		       ph.status, ph.color,
		       to_char(ph.start_date,'YYYY-MM-DD'), to_char(ph.end_date,'YYYY-MM-DD')
		FROM pm_phases ph
		JOIN pm_projects p ON p.id = ph.project_id
		WHERE ph.project_id = $1 AND p.company_id = $2
		ORDER BY ph.order_index ASC
	`, projectID, companyID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	phases := []PMPhase{}
	for rows.Next() {
		var ph PMPhase
		var sd, ed sql.NullString
		if err := rows.Scan(&ph.ID, &ph.ProjectID, &ph.Name, &ph.Description, &ph.OrderIndex,
			&ph.Status, &ph.Color, &sd, &ed); err != nil {
			jsonErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		if sd.Valid {
			ph.StartDate = &sd.String
		}
		if ed.Valid {
			ph.EndDate = &ed.String
		}
		phases = append(phases, ph)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"phases": phases})
}

func pmCreatePhase(w http.ResponseWriter, r *http.Request, db *sql.DB, projectID, companyID string) {
	var req struct {
		Name        string  `json:"name"`
		Description string  `json:"description"`
		Color       string  `json:"color"`
		StartDate   *string `json:"start_date"`
		EndDate     *string `json:"end_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	if req.Name == "" {
		jsonErr(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Color == "" {
		req.Color = "#6366f1"
	}

	var maxOrder int
	db.QueryRow(`SELECT COALESCE(MAX(order_index),0) FROM pm_phases WHERE project_id=$1`, projectID).Scan(&maxOrder)

	var id string
	err := db.QueryRow(`
		INSERT INTO pm_phases (project_id, name, description, color, order_index, start_date, end_date)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
	`, projectID, req.Name, req.Description, req.Color, maxOrder+1, req.StartDate, req.EndDate).Scan(&id)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": id})
}

func pmUpdatePhase(w http.ResponseWriter, r *http.Request, db *sql.DB, phaseID, companyID string) {
	var req struct {
		Name        string  `json:"name"`
		Description string  `json:"description"`
		Status      string  `json:"status"`
		Color       string  `json:"color"`
		OrderIndex  int     `json:"order_index"`
		StartDate   *string `json:"start_date"`
		EndDate     *string `json:"end_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	_, err := db.Exec(`
		UPDATE pm_phases SET name=$1, description=$2, status=$3, color=$4,
		       order_index=$5, start_date=$6, end_date=$7
		WHERE id=$8
	`, req.Name, req.Description, req.Status, req.Color, req.OrderIndex, req.StartDate, req.EndDate, phaseID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func pmDeletePhase(w http.ResponseWriter, db *sql.DB, phaseID, companyID string) {
	db.Exec(`DELETE FROM pm_phases WHERE id=$1`, phaseID)
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// ---------------------------------------------------------------------------
// Sprints
// ---------------------------------------------------------------------------

type PMSprint struct {
	ID        string  `json:"id"`
	ProjectID string  `json:"project_id"`
	Name      string  `json:"name"`
	Goal      string  `json:"goal"`
	Status    string  `json:"status"`
	StartDate *string `json:"start_date"`
	EndDate   *string `json:"end_date"`
	CreatedAt time.Time `json:"created_at"`
}

func pmListSprints(w http.ResponseWriter, db *sql.DB, projectID, companyID string) {
	rows, err := db.Query(`
		SELECT s.id, s.project_id, s.name, COALESCE(s.goal,''), s.status,
		       to_char(s.start_date,'YYYY-MM-DD'), to_char(s.end_date,'YYYY-MM-DD'), s.created_at
		FROM pm_sprints s
		JOIN pm_projects p ON p.id = s.project_id
		WHERE s.project_id = $1 AND p.company_id = $2
		ORDER BY s.created_at DESC
	`, projectID, companyID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	sprints := []PMSprint{}
	for rows.Next() {
		var s PMSprint
		var sd, ed sql.NullString
		if err := rows.Scan(&s.ID, &s.ProjectID, &s.Name, &s.Goal, &s.Status, &sd, &ed, &s.CreatedAt); err != nil {
			jsonErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		if sd.Valid {
			s.StartDate = &sd.String
		}
		if ed.Valid {
			s.EndDate = &ed.String
		}
		sprints = append(sprints, s)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"sprints": sprints})
}

func pmCreateSprint(w http.ResponseWriter, r *http.Request, db *sql.DB, projectID, companyID string) {
	var req struct {
		Name      string  `json:"name"`
		Goal      string  `json:"goal"`
		StartDate *string `json:"start_date"`
		EndDate   *string `json:"end_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	if req.Name == "" {
		jsonErr(w, http.StatusBadRequest, "name is required")
		return
	}

	var id string
	err := db.QueryRow(`
		INSERT INTO pm_sprints (project_id, name, goal, start_date, end_date)
		VALUES ($1,$2,$3,$4,$5) RETURNING id
	`, projectID, req.Name, req.Goal, req.StartDate, req.EndDate).Scan(&id)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": id})
}

func pmUpdateSprint(w http.ResponseWriter, r *http.Request, db *sql.DB, sprintID, companyID string) {
	var req struct {
		Name      string  `json:"name"`
		Goal      string  `json:"goal"`
		Status    string  `json:"status"`
		StartDate *string `json:"start_date"`
		EndDate   *string `json:"end_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	_, err := db.Exec(`
		UPDATE pm_sprints SET name=$1, goal=$2, status=$3, start_date=$4, end_date=$5
		WHERE id=$6
	`, req.Name, req.Goal, req.Status, req.StartDate, req.EndDate, sprintID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func pmDeleteSprint(w http.ResponseWriter, db *sql.DB, sprintID, companyID string) {
	db.Exec(`DELETE FROM pm_sprints WHERE id=$1`, sprintID)
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// ---------------------------------------------------------------------------
// Activity Log
// ---------------------------------------------------------------------------

type PMActivity struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"project_id"`
	TaskID    *string   `json:"task_id"`
	UserID    *string   `json:"user_id"`
	UserName  string    `json:"user_name"`
	Action    string    `json:"action"`
	OldValue  *string   `json:"old_value"`
	NewValue  *string   `json:"new_value"`
	CreatedAt time.Time `json:"created_at"`
}

func pmListActivity(w http.ResponseWriter, r *http.Request, db *sql.DB, projectID, companyID string) {
	limit := 50
	rows, err := db.Query(`
		SELECT a.id, a.project_id, a.task_id, a.user_id,
		       COALESCE(u.full_name,'Sistema'), a.action, a.old_value, a.new_value, a.created_at
		FROM pm_activity_log a
		LEFT JOIN users u ON u.id = a.user_id
		JOIN pm_projects p ON p.id = a.project_id
		WHERE a.project_id = $1 AND p.company_id = $2
		ORDER BY a.created_at DESC
		LIMIT $3
	`, projectID, companyID, limit)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	activities := []PMActivity{}
	for rows.Next() {
		var a PMActivity
		var tid, uid, ov, nv sql.NullString
		if err := rows.Scan(&a.ID, &a.ProjectID, &tid, &uid, &a.UserName,
			&a.Action, &ov, &nv, &a.CreatedAt); err != nil {
			jsonErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		if tid.Valid {
			a.TaskID = &tid.String
		}
		if uid.Valid {
			a.UserID = &uid.String
		}
		if ov.Valid {
			a.OldValue = &ov.String
		}
		if nv.Valid {
			a.NewValue = &nv.String
		}
		activities = append(activities, a)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"activities": activities})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func pmLogActivity(db *sql.DB, projectID, taskID, userID, action, oldVal, newVal string) {
	var tid, uid interface{}
	if taskID != "" {
		tid = taskID
	}
	if userID != "" {
		uid = userID
	}
	db.Exec(`
		INSERT INTO pm_activity_log (project_id, task_id, user_id, action, old_value, new_value)
		VALUES ($1,$2,$3,$4,$5,$6)
	`, projectID, tid, uid, action, nullStr(oldVal), nullStr(newVal))
}

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
