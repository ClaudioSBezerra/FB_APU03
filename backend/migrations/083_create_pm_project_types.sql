-- Migration 083: Tabela de tipos de projeto (PM)
CREATE TABLE pm_project_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  code        VARCHAR(50)  NOT NULL UNIQUE,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  order_index INT     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed: tipos iniciais (migração dos valores hardcoded)
INSERT INTO pm_project_types (name, code, order_index) VALUES
  ('Implementação SAP', 'sap_implementation', 1),
  ('Migração ERP',      'erp_migration',      2),
  ('Customização',      'customization',      3),
  ('Manutenção',        'maintenance',        4),
  ('Consultoria',       'consulting',         5);

-- Atualiza registros existentes que tinham 'Implantação SAP' (código antigo continua igual)
-- O código sap_implementation já é o correto; apenas o nome no seed foi corrigido acima.
