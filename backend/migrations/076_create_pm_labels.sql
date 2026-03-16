-- PM Module: Labels / Tags
CREATE TABLE IF NOT EXISTS pm_labels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  name       VARCHAR(50) NOT NULL,
  color      VARCHAR(20) NOT NULL DEFAULT '#94a3b8',
  UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS pm_task_labels (
  task_id  UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES pm_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);
