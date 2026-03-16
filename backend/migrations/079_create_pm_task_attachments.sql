-- PM Module: Task Attachments (PDF, Excel, imagens)
CREATE TABLE IF NOT EXISTS pm_task_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename     VARCHAR(255) NOT NULL,    -- nome original
  stored_name  VARCHAR(255) NOT NULL,   -- nome em disco (uuid + extensão)
  file_path    VARCHAR(500) NOT NULL,   -- caminho relativo: pm/attachments/{task_id}/
  file_size    BIGINT,
  mime_type    VARCHAR(100),
  -- application/pdf | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  -- application/vnd.ms-excel | text/csv | image/png | image/jpeg
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pm_attachments_task ON pm_task_attachments(task_id, created_at DESC);
