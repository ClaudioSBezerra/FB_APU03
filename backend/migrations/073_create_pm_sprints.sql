-- PM Module: Sprints
CREATE TABLE IF NOT EXISTS pm_sprints (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  goal       TEXT,
  status     VARCHAR(20) NOT NULL DEFAULT 'planning',
  -- status: planning | active | completed
  start_date DATE,
  end_date   DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pm_sprints_project ON pm_sprints(project_id);
