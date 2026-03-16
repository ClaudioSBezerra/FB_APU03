-- PM Module: Task Audio Notes (gravação de voz + transcrição Z.AI)
CREATE TABLE IF NOT EXISTS pm_task_audio_notes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id              UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Arquivo de áudio
  audio_filename       VARCHAR(255) NOT NULL,   -- nome original do arquivo
  audio_stored_name    VARCHAR(255) NOT NULL,   -- nome em disco (uuid.webm)
  audio_path           VARCHAR(500) NOT NULL,   -- caminho relativo ex: pm/audio/{task_id}/
  audio_size_bytes     BIGINT,
  duration_secs        INT,                     -- duração em segundos (preenchido pelo frontend)
  -- Transcrição Z.AI
  transcription        TEXT,                    -- texto retornado pela Z.AI
  transcription_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- status: pending | processing | done | failed
  transcription_error  TEXT,                   -- mensagem de erro se failed
  -- Observação final (editável pelo usuário)
  observation          TEXT,                   -- texto final salvo (pode diferir da transcrição)
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pm_audio_task ON pm_task_audio_notes(task_id, created_at DESC);
