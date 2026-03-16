package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// ---------------------------------------------------------------------------
// Structs
// ---------------------------------------------------------------------------

type PMTemplate struct {
	ID          string           `json:"id"`
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Active      bool             `json:"active"`
	OrderIndex  int              `json:"order_index"`
	Phases      []PMTemplatePhase `json:"phases"`
}

type PMTemplatePhase struct {
	ID          string `json:"id"`
	TemplateID  string `json:"template_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	OrderIndex  int    `json:"order_index"`
	Color       string `json:"color"`
}

// ---------------------------------------------------------------------------
// PMProjectTemplatesHandler — GET /api/pm/project-templates (público)
// Retorna templates ativos com suas fases
// ---------------------------------------------------------------------------

func PMProjectTemplatesHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method != http.MethodGet {
			jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
			return
		}

		rows, err := db.Query(`
			SELECT t.id, t.name, COALESCE(t.description,''), t.active, t.order_index
			FROM pm_project_templates t
			WHERE t.active = true
			ORDER BY t.order_index, t.name
		`)
		if err != nil {
			jsonErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		defer rows.Close()

		templates := []PMTemplate{}
		var ids []string
		idMap := map[string]*PMTemplate{}
		for rows.Next() {
			var t PMTemplate
			t.Phases = []PMTemplatePhase{}
			if err := rows.Scan(&t.ID, &t.Name, &t.Description, &t.Active, &t.OrderIndex); err != nil {
				continue
			}
			templates = append(templates, t)
			ids = append(ids, t.ID)
		}

		// Buscar fases de todos os templates de uma vez
		if len(ids) > 0 {
			for i := range templates {
				idMap[templates[i].ID] = &templates[i]
			}
			phaseRows, err := db.Query(`
				SELECT id, template_id, name, COALESCE(description,''), order_index, color
				FROM pm_template_phases
				WHERE template_id = ANY($1::uuid[])
				ORDER BY template_id, order_index
			`, "{"+strings.Join(ids, ",")+"}")
			if err == nil {
				defer phaseRows.Close()
				for phaseRows.Next() {
					var p PMTemplatePhase
					if err := phaseRows.Scan(&p.ID, &p.TemplateID, &p.Name, &p.Description, &p.OrderIndex, &p.Color); err != nil {
						continue
					}
					if t, ok := idMap[p.TemplateID]; ok {
						t.Phases = append(t.Phases, p)
					}
				}
			}
		}

		json.NewEncoder(w).Encode(templates)
	}
}

// ---------------------------------------------------------------------------
// PMProjectTemplatesAdminHandler — admin CRUD /api/pm/project-templates/
// ---------------------------------------------------------------------------

func PMProjectTemplatesAdminHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value(ClaimsKey).(jwt.MapClaims)
		if !ok {
			jsonErr(w, http.StatusUnauthorized, "Unauthorized")
			return
		}
		role, _ := claims["role"].(string)
		if role != "admin" {
			jsonErr(w, http.StatusForbidden, "Admin required")
			return
		}

		// parse path suffix after /api/pm/project-templates/
		rest := strings.TrimPrefix(r.URL.Path, "/api/pm/project-templates/")
		rest = strings.Trim(rest, "/")
		parts := []string{}
		if rest != "" {
			parts = strings.SplitN(rest, "/", 3)
		}

		switch len(parts) {
		case 0:
			// /api/pm/project-templates/
			switch r.Method {
			case http.MethodGet:
				pmListTemplatesAll(w, db)
			case http.MethodPost:
				pmCreateTemplate(w, r, db)
			default:
				jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
			}

		case 1:
			templateID := parts[0]
			// /api/pm/project-templates/{id}
			switch r.Method {
			case http.MethodPut:
				pmUpdateTemplate(w, r, db, templateID)
			case http.MethodDelete:
				pmDeleteTemplate(w, db, templateID)
			default:
				jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
			}

		case 2:
			// /api/pm/project-templates/{id}/phases
			templateID := parts[0]
			if parts[1] == "phases" {
				switch r.Method {
				case http.MethodPost:
					pmCreateTemplatePhase(w, r, db, templateID)
				default:
					jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
				}
			} else if parts[1] != "" {
				// /api/pm/project-templates/{id}/phases/{phaseId}  — não, aqui seria phase_id em parts[1]
				// Handle phase update/delete: PUT|DELETE /api/pm/project-templates/{id}/phase/{phaseId}
				jsonErr(w, http.StatusNotFound, "Not found")
			}

		default:
			jsonErr(w, http.StatusNotFound, "Not found")
		}
	}
}

// Handler para fases individuais: /api/pm/template-phases/{id}
func PMTemplatePhasesHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		claims, ok := r.Context().Value(ClaimsKey).(jwt.MapClaims)
		if !ok {
			jsonErr(w, http.StatusUnauthorized, "Unauthorized")
			return
		}
		role, _ := claims["role"].(string)
		if role != "admin" {
			jsonErr(w, http.StatusForbidden, "Admin required")
			return
		}

		rest := strings.TrimPrefix(r.URL.Path, "/api/pm/template-phases/")
		phaseID := strings.Trim(rest, "/")
		if phaseID == "" {
			jsonErr(w, http.StatusBadRequest, "phase id required")
			return
		}

		switch r.Method {
		case http.MethodPut:
			pmUpdateTemplatePhase(w, r, db, phaseID)
		case http.MethodDelete:
			pmDeleteTemplatePhase(w, db, phaseID)
		default:
			jsonErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
	}
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

func pmListTemplatesAll(w http.ResponseWriter, db *sql.DB) {
	rows, err := db.Query(`
		SELECT t.id, t.name, COALESCE(t.description,''), t.active, t.order_index
		FROM pm_project_templates t
		ORDER BY t.order_index, t.name
	`)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	templates := []PMTemplate{}
	idMap := map[string]*PMTemplate{}
	var ids []string
	for rows.Next() {
		var t PMTemplate
		t.Phases = []PMTemplatePhase{}
		if err := rows.Scan(&t.ID, &t.Name, &t.Description, &t.Active, &t.OrderIndex); err != nil {
			continue
		}
		templates = append(templates, t)
		ids = append(ids, t.ID)
	}

	if len(ids) > 0 {
		for i := range templates {
			idMap[templates[i].ID] = &templates[i]
		}
		phaseRows, err := db.Query(`
			SELECT id, template_id, name, COALESCE(description,''), order_index, color
			FROM pm_template_phases
			WHERE template_id = ANY($1::uuid[])
			ORDER BY template_id, order_index
		`, "{"+strings.Join(ids, ",")+"}")
		if err == nil {
			defer phaseRows.Close()
			for phaseRows.Next() {
				var p PMTemplatePhase
				if err := phaseRows.Scan(&p.ID, &p.TemplateID, &p.Name, &p.Description, &p.OrderIndex, &p.Color); err != nil {
					continue
				}
				if t, ok := idMap[p.TemplateID]; ok {
					t.Phases = append(t.Phases, p)
				}
			}
		}
	}

	json.NewEncoder(w).Encode(templates)
}

func pmCreateTemplate(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		OrderIndex  int    `json:"order_index"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		jsonErr(w, http.StatusBadRequest, "name is required")
		return
	}

	var id string
	err := db.QueryRow(`
		INSERT INTO pm_project_templates (name, description, order_index)
		VALUES ($1, $2, $3) RETURNING id
	`, req.Name, req.Description, req.OrderIndex).Scan(&id)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": id})
}

func pmUpdateTemplate(w http.ResponseWriter, r *http.Request, db *sql.DB, id string) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Active      bool   `json:"active"`
		OrderIndex  int    `json:"order_index"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	_, err := db.Exec(`
		UPDATE pm_project_templates SET name=$1, description=$2, active=$3, order_index=$4
		WHERE id=$5
	`, req.Name, req.Description, req.Active, req.OrderIndex, id)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func pmDeleteTemplate(w http.ResponseWriter, db *sql.DB, id string) {
	_, err := db.Exec(`DELETE FROM pm_project_templates WHERE id=$1`, id)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func pmCreateTemplatePhase(w http.ResponseWriter, r *http.Request, db *sql.DB, templateID string) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		OrderIndex  int    `json:"order_index"`
		Color       string `json:"color"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		jsonErr(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Color == "" {
		req.Color = "#6366f1"
	}

	var id string
	err := db.QueryRow(`
		INSERT INTO pm_template_phases (template_id, name, description, order_index, color)
		VALUES ($1, $2, $3, $4, $5) RETURNING id
	`, templateID, req.Name, req.Description, req.OrderIndex, req.Color).Scan(&id)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": id})
}

func pmUpdateTemplatePhase(w http.ResponseWriter, r *http.Request, db *sql.DB, id string) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		OrderIndex  int    `json:"order_index"`
		Color       string `json:"color"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	if req.Color == "" {
		req.Color = "#6366f1"
	}
	_, err := db.Exec(`
		UPDATE pm_template_phases SET name=$1, description=$2, order_index=$3, color=$4
		WHERE id=$5
	`, req.Name, req.Description, req.OrderIndex, req.Color, id)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func pmDeleteTemplatePhase(w http.ResponseWriter, db *sql.DB, id string) {
	_, err := db.Exec(`DELETE FROM pm_template_phases WHERE id=$1`, id)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}
