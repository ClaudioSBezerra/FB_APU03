-- PM Module: Activity Log
CREATE TABLE IF NOT EXISTS pm_activity_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  task_id    UUID REFERENCES pm_tasks(id) ON DELETE SET NULL,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(60) NOT NULL,
  -- ex: task_created | task_moved | task_assigned | comment_added | member_added | audio_note_added | attachment_added
  old_value  TEXT,
  new_value  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pm_activity_project ON pm_activity_log(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pm_activity_task    ON pm_activity_log(task_id, created_at DESC);
