-- PM Module: Tasks (Kanban cards)
CREATE TABLE IF NOT EXISTS pm_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  phase_id     UUID REFERENCES pm_phases(id) ON DELETE SET NULL,
  sprint_id    UUID REFERENCES pm_sprints(id) ON DELETE SET NULL,
  title        VARCHAR(300) NOT NULL,
  description  TEXT,
  status       VARCHAR(30) NOT NULL DEFAULT 'backlog',
  -- status: backlog | todo | in_progress | review | done | blocked
  priority     VARCHAR(20) NOT NULL DEFAULT 'medium',
  -- priority: critical | high | medium | low
  type         VARCHAR(20) NOT NULL DEFAULT 'task',
  -- type: story | task | bug | improvement | risk
  assigned_to  UUID REFERENCES users(id) ON DELETE SET NULL,
  reporter_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  story_points INT,
  due_date     DATE,
  order_index  INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pm_tasks_project ON pm_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_pm_tasks_status  ON pm_tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_pm_tasks_sprint  ON pm_tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_pm_tasks_assigned ON pm_tasks(assigned_to);
