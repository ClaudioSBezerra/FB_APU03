package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"time"
)

// pmExportTasksExcel exports all tasks of a project as an Excel file.
// Called from PMProjectsHandler for GET /api/pm/projects/{id}/export/tasks
// Uses CSV fallback since excelize is not yet in go.mod.
// To upgrade to real .xlsx: add github.com/xuri/excelize/v2 to go.mod.
func pmExportTasksExcel(w http.ResponseWriter, r *http.Request, db *sql.DB, projectID, companyID string) {
	// verify project belongs to company
	var projName string
	err := db.QueryRow(`SELECT name FROM pm_projects WHERE id=$1 AND company_id=$2`,
		projectID, companyID).Scan(&projName)
	if err == sql.ErrNoRows {
		jsonErr(w, http.StatusNotFound, "Project not found")
		return
	}

	rows, err := db.Query(`
		SELECT t.title, t.type, t.status, t.priority,
		       COALESCE(ph.name,''), COALESCE(sp.name,''),
		       COALESCE(ua.full_name,''), COALESCE(t.story_points::text,''),
		       COALESCE(to_char(t.due_date,'DD/MM/YYYY'),''),
		       to_char(t.created_at,'DD/MM/YYYY HH24:MI')
		FROM pm_tasks t
		LEFT JOIN pm_phases ph ON ph.id = t.phase_id
		LEFT JOIN pm_sprints sp ON sp.id = t.sprint_id
		LEFT JOIN users ua ON ua.id = t.assigned_to
		WHERE t.project_id = $1
		ORDER BY t.status, t.priority, t.created_at
	`, projectID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	// Generate CSV (universally opened by Excel)
	filename := fmt.Sprintf("tarefas_%s_%s.csv",
		sanitizeFilename(projName),
		time.Now().Format("20060102"))

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")

	// UTF-8 BOM so Excel opens correctly
	w.Write([]byte("\xEF\xBB\xBF"))

	// header row
	fmt.Fprintf(w, "Título,Tipo,Status,Prioridade,Fase,Sprint,Responsável,Story Points,Data Vencimento,Criado Em\n")

	for rows.Next() {
		var title, typ, status, priority, phase, sprint, assignee, sp, dueDate, createdAt string
		if err := rows.Scan(&title, &typ, &status, &priority, &phase, &sprint,
			&assignee, &sp, &dueDate, &createdAt); err != nil {
			continue
		}
		fmt.Fprintf(w, "%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n",
			csvEscape(title),
			csvEscape(translateStatus(typ)),
			csvEscape(translateStatus(status)),
			csvEscape(translatePriority(priority)),
			csvEscape(phase),
			csvEscape(sprint),
			csvEscape(assignee),
			sp,
			dueDate,
			createdAt,
		)
	}
}

func sanitizeFilename(s string) string {
	result := make([]byte, 0, len(s))
	for _, b := range []byte(s) {
		if (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9') {
			result = append(result, b)
		} else {
			result = append(result, '_')
		}
	}
	if len(result) > 30 {
		result = result[:30]
	}
	return string(result)
}

func csvEscape(s string) string {
	// wrap in quotes if contains comma, quote or newline
	needsQuote := false
	for _, c := range s {
		if c == ',' || c == '"' || c == '\n' || c == '\r' {
			needsQuote = true
			break
		}
	}
	if !needsQuote {
		return s
	}
	// escape internal quotes
	escaped := ""
	for _, c := range s {
		if c == '"' {
			escaped += "\"\""
		} else {
			escaped += string(c)
		}
	}
	return "\"" + escaped + "\""
}

func translateStatus(s string) string {
	m := map[string]string{
		"backlog":     "Backlog",
		"todo":        "A Fazer",
		"in_progress": "Em Andamento",
		"review":      "Em Revisão",
		"done":        "Concluído",
		"blocked":     "Bloqueado",
		"story":       "História",
		"task":        "Tarefa",
		"bug":         "Bug",
		"improvement": "Melhoria",
		"risk":        "Risco",
	}
	if v, ok := m[s]; ok {
		return v
	}
	return s
}

func translatePriority(s string) string {
	m := map[string]string{
		"critical": "Crítico",
		"high":     "Alto",
		"medium":   "Médio",
		"low":      "Baixo",
	}
	if v, ok := m[s]; ok {
		return v
	}
	return s
}
