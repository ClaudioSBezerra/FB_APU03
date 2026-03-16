-- Migration 082: Papel do usuário no módulo PM + dono/PM do projeto

-- Campo pm_role na tabela users (restrito ao módulo de Gestão de Projetos)
ALTER TABLE users ADD COLUMN IF NOT EXISTS pm_role VARCHAR(30) DEFAULT '';

-- Dono (sponsor/cliente) e Gerente (PM) direto no projeto
ALTER TABLE pm_projects ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE pm_projects ADD COLUMN IF NOT EXISTS pm_id    UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pm_projects_owner ON pm_projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_pm_projects_pm    ON pm_projects(pm_id);
