-- Migration 080: Remove fiscal/tax tables not needed in FB_APU03 (Gestão de Projetos)
-- Mantém apenas: users, companies, environments, user_environments, auth tables e pm_* tables

-- 1. Materialized views first (dependem das tabelas base)
DROP MATERIALIZED VIEW IF EXISTS mv_mercadorias_agregada;
DROP MATERIALIZED VIEW IF EXISTS mv_operacoes_simples;
DROP MATERIALIZED VIEW IF EXISTS mv_compras_fornecedores;

-- 2. Tabelas fiscais / DFe
DROP TABLE IF EXISTS dfe_xml CASCADE;
DROP TABLE IF EXISTS nfe_saidas CASCADE;
DROP TABLE IF EXISTS nfe_entradas CASCADE;
DROP TABLE IF EXISTS cte_entradas CASCADE;

-- 3. Tabelas RFB
DROP TABLE IF EXISTS rfb_debitos CASCADE;
DROP TABLE IF EXISTS rfb_resumo CASCADE;
DROP TABLE IF EXISTS rfb_requests CASCADE;
DROP TABLE IF EXISTS rfb_credentials CASCADE;
DROP TABLE IF EXISTS rfb_agendamentos CASCADE;

-- 4. Tabelas de apuração / SPED
DROP TABLE IF EXISTS reg_c190 CASCADE;
DROP TABLE IF EXISTS reg_c100 CASCADE;
DROP TABLE IF EXISTS reg_0140 CASCADE;
DROP TABLE IF EXISTS reg_d500 CASCADE;
DROP TABLE IF EXISTS operacoes_comerciais CASCADE;
DROP TABLE IF EXISTS energia CASCADE;
DROP TABLE IF EXISTS frete CASCADE;
DROP TABLE IF EXISTS comunicacoes CASCADE;

-- 5. Tabelas de configuração fiscal
DROP TABLE IF EXISTS filial_apelidos CASCADE;
DROP TABLE IF EXISTS forn_simples CASCADE;
DROP TABLE IF EXISTS cfop CASCADE;
DROP TABLE IF EXISTS tabela_aliquotas CASCADE;

-- 6. Tabelas de IA / relatórios fiscais
DROP TABLE IF EXISTS ai_reports CASCADE;
DROP TABLE IF EXISTS managers CASCADE;

-- 7. Tabelas de jobs de importação
DROP TABLE IF EXISTS import_jobs CASCADE;
DROP TABLE IF EXISTS participants CASCADE;
