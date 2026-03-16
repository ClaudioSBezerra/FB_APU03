-- Migration 085: Templates de projeto com fases pré-configuradas

CREATE TABLE IF NOT EXISTS pm_project_templates (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(100) NOT NULL,
    description  TEXT,
    active       BOOLEAN NOT NULL DEFAULT true,
    order_index  INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pm_template_phases (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id  UUID NOT NULL REFERENCES pm_project_templates(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    description  TEXT,
    order_index  INT NOT NULL DEFAULT 0,
    color        VARCHAR(20) NOT NULL DEFAULT '#6366f1'
);

-- Templates padrão
INSERT INTO pm_project_templates (name, description, order_index) VALUES
    ('Kanban Simples',        'Fluxo básico de 4 colunas para qualquer projeto', 10),
    ('Implementação SAP',     'Fases típicas de um projeto SAP ERP',              20),
    ('Desenvolvimento Ágil',  'Sprint-based com preparação e entrega',            30),
    ('Consultoria',           'Diagnóstico, proposta, execução e encerramento',   40)
ON CONFLICT DO NOTHING;

-- Fases: Kanban Simples
INSERT INTO pm_template_phases (template_id, name, order_index, color)
SELECT id, 'Backlog',     10, '#94a3b8' FROM pm_project_templates WHERE name = 'Kanban Simples'
UNION ALL
SELECT id, 'A Fazer',     20, '#3b82f6' FROM pm_project_templates WHERE name = 'Kanban Simples'
UNION ALL
SELECT id, 'Em Andamento',30, '#f59e0b' FROM pm_project_templates WHERE name = 'Kanban Simples'
UNION ALL
SELECT id, 'Concluído',   40, '#22c55e' FROM pm_project_templates WHERE name = 'Kanban Simples';

-- Fases: Implementação SAP
INSERT INTO pm_template_phases (template_id, name, order_index, color)
SELECT id, 'Projeto',        10, '#6366f1' FROM pm_project_templates WHERE name = 'Implementação SAP'
UNION ALL
SELECT id, 'Blueprint',      20, '#3b82f6' FROM pm_project_templates WHERE name = 'Implementação SAP'
UNION ALL
SELECT id, 'Realização',     30, '#f59e0b' FROM pm_project_templates WHERE name = 'Implementação SAP'
UNION ALL
SELECT id, 'Preparação Final', 40, '#ec4899' FROM pm_project_templates WHERE name = 'Implementação SAP'
UNION ALL
SELECT id, 'Go Live',        50, '#22c55e' FROM pm_project_templates WHERE name = 'Implementação SAP'
UNION ALL
SELECT id, 'Suporte Pós-Go Live', 60, '#14b8a6' FROM pm_project_templates WHERE name = 'Implementação SAP';

-- Fases: Desenvolvimento Ágil
INSERT INTO pm_template_phases (template_id, name, order_index, color)
SELECT id, 'Backlog',       10, '#94a3b8' FROM pm_project_templates WHERE name = 'Desenvolvimento Ágil'
UNION ALL
SELECT id, 'Sprint Planning',20, '#6366f1' FROM pm_project_templates WHERE name = 'Desenvolvimento Ágil'
UNION ALL
SELECT id, 'Em Sprint',     30, '#f59e0b' FROM pm_project_templates WHERE name = 'Desenvolvimento Ágil'
UNION ALL
SELECT id, 'Revisão',       40, '#ec4899' FROM pm_project_templates WHERE name = 'Desenvolvimento Ágil'
UNION ALL
SELECT id, 'Entregue',      50, '#22c55e' FROM pm_project_templates WHERE name = 'Desenvolvimento Ágil';

-- Fases: Consultoria
INSERT INTO pm_template_phases (template_id, name, order_index, color)
SELECT id, 'Diagnóstico',   10, '#6366f1' FROM pm_project_templates WHERE name = 'Consultoria'
UNION ALL
SELECT id, 'Proposta',      20, '#3b82f6' FROM pm_project_templates WHERE name = 'Consultoria'
UNION ALL
SELECT id, 'Execução',      30, '#f59e0b' FROM pm_project_templates WHERE name = 'Consultoria'
UNION ALL
SELECT id, 'Validação',     40, '#ec4899' FROM pm_project_templates WHERE name = 'Consultoria'
UNION ALL
SELECT id, 'Encerramento',  50, '#22c55e' FROM pm_project_templates WHERE name = 'Consultoria';
