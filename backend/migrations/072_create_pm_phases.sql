-- PM Module: Project Phases / Milestones
CREATE TABLE IF NOT EXISTS pm_phases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  status      VARCHAR(30) NOT NULL DEFAULT 'pending',
  -- status: pending | active | completed
  color       VARCHAR(20) NOT NULL DEFAULT '#6366f1',
  start_date  DATE,
  end_date    DATE
);
CREATE INDEX IF NOT EXISTS idx_pm_phases_project ON pm_phases(project_id, order_index);
