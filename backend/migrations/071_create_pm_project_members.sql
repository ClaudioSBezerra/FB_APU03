-- PM Module: Project Members (team)
CREATE TABLE IF NOT EXISTS pm_project_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       VARCHAR(30) NOT NULL DEFAULT 'developer',
  -- role: sponsor | pm | consultant | developer | key_user | functional
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_pm_members_project ON pm_project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_pm_members_user    ON pm_project_members(user_id);
