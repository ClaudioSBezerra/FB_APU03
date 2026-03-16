-- PM Module: Projects
CREATE TABLE IF NOT EXISTS pm_projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         VARCHAR(200) NOT NULL,
  description  TEXT,
  status       VARCHAR(30) NOT NULL DEFAULT 'planning',
  -- status: planning | active | on_hold | completed | cancelled
  type         VARCHAR(50) NOT NULL DEFAULT 'sap_implementation',
  -- type: sap_implementation | erp_migration | customization | maintenance | consulting
  start_date   DATE,
  end_date     DATE,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pm_projects_company ON pm_projects(company_id);
CREATE INDEX IF NOT EXISTS idx_pm_projects_status  ON pm_projects(company_id, status);
