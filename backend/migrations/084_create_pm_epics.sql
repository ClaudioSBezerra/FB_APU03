-- Migration 084: Create pm_epics table and add epic_id to pm_tasks

CREATE TABLE IF NOT EXISTS pm_epics (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  name         VARCHAR(200) NOT NULL,
  description  TEXT         DEFAULT '',
  status       VARCHAR(30)  DEFAULT 'open',
  color        VARCHAR(20)  DEFAULT '#6366f1',
  start_date   DATE,
  end_date     DATE,
  order_index  INT          DEFAULT 0,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_epics_project ON pm_epics(project_id);

ALTER TABLE pm_tasks
  ADD COLUMN IF NOT EXISTS epic_id UUID REFERENCES pm_epics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pm_tasks_epic ON pm_tasks(epic_id) WHERE epic_id IS NOT NULL;
