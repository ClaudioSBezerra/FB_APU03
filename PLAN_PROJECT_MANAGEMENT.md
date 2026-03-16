# Plano de Implementação — Módulo de Gestão de Projetos (PM)

## Visão Geral

Adicionar um **novo módulo "Projetos"** ao FB_APU03, sem quebrar nada existente. O módulo é inspirado em Jira/Linear e voltado para projetos de implantação de SAP/ERP. Reutiliza 100% da stack atual (autenticação JWT, multi-tenant por `X-Company-ID`, shadcn/ui, Tailwind, Go net/http).

---

## 1. Banco de Dados — Novas Migrations

13 novas migrations no padrão existente (`backend/migrations/`):

### `071_create_pm_projects.sql`
```sql
CREATE TABLE pm_projects (
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
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pm_projects_company ON pm_projects(company_id);
```

### `072_create_pm_project_members.sql`
```sql
CREATE TABLE pm_project_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       VARCHAR(30) NOT NULL DEFAULT 'developer',
  -- role: sponsor | pm | consultant | developer | key_user | functional
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);
```

### `073_create_pm_phases.sql`
```sql
CREATE TABLE pm_phases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  status      VARCHAR(30) NOT NULL DEFAULT 'pending',
  -- status: pending | active | completed
  color       VARCHAR(20) DEFAULT '#6366f1',
  start_date  DATE,
  end_date    DATE
);
```

### `074_create_pm_sprints.sql`
```sql
CREATE TABLE pm_sprints (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  goal       TEXT,
  status     VARCHAR(20) NOT NULL DEFAULT 'planning',
  -- status: planning | active | completed
  start_date DATE,
  end_date   DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `075_create_pm_tasks.sql`
```sql
CREATE TABLE pm_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  phase_id     UUID REFERENCES pm_phases(id) ON DELETE SET NULL,
  sprint_id    UUID REFERENCES pm_sprints(id) ON DELETE SET NULL,
  title        VARCHAR(300) NOT NULL,
  description  TEXT,
  status       VARCHAR(30) NOT NULL DEFAULT 'backlog',
  -- status: backlog | todo | in_progress | review | done | blocked
  priority     VARCHAR(20) NOT NULL DEFAULT 'medium',
  -- priority: critical | high | medium | low
  type         VARCHAR(20) NOT NULL DEFAULT 'task',
  -- type: story | task | bug | improvement | risk
  assigned_to  UUID REFERENCES users(id) ON DELETE SET NULL,
  reporter_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  story_points INT,
  due_date     DATE,
  order_index  INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);
CREATE INDEX idx_pm_tasks_project ON pm_tasks(project_id);
CREATE INDEX idx_pm_tasks_status  ON pm_tasks(project_id, status);
CREATE INDEX idx_pm_tasks_sprint  ON pm_tasks(sprint_id);
```

### `076_create_pm_task_comments.sql`
```sql
CREATE TABLE pm_task_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `077_create_pm_labels.sql`
```sql
CREATE TABLE pm_labels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  name       VARCHAR(50) NOT NULL,
  color      VARCHAR(20) NOT NULL DEFAULT '#94a3b8',
  UNIQUE(project_id, name)
);

CREATE TABLE pm_task_labels (
  task_id  UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES pm_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);
```

### `078_create_pm_activity_log.sql`
```sql
CREATE TABLE pm_activity_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  task_id    UUID REFERENCES pm_tasks(id) ON DELETE SET NULL,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(50) NOT NULL,
  -- ex: task_created | task_moved | task_assigned | comment_added | member_added | audio_note_added
  old_value  TEXT,
  new_value  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pm_activity_project ON pm_activity_log(project_id, created_at DESC);
```

### `079_create_pm_task_audio_notes.sql`
```sql
CREATE TABLE pm_task_audio_notes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Arquivo de áudio
  audio_filename   VARCHAR(255) NOT NULL,        -- nome do arquivo em disco
  audio_path       VARCHAR(500) NOT NULL,        -- caminho relativo em /uploads/pm/audio/
  audio_size_bytes BIGINT,
  duration_secs    INT,                          -- duração em segundos
  -- Transcrição Z.AI
  transcription    TEXT,                         -- texto transcrito pela IA
  transcription_status VARCHAR(20) DEFAULT 'pending',
  -- status: pending | processing | done | failed
  -- Observação final (pode ser editada pelo usuário após transcrição)
  observation      TEXT,                         -- texto final salvo (pode diferir da transcrição)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pm_audio_notes_task ON pm_task_audio_notes(task_id, created_at DESC);
```

---

## 2. Backend — Novos Handlers + Serviço Z.AI

Criar em `backend/handlers/`:

| Arquivo | Responsabilidade |
|---|---|
| `pm_projects.go` | CRUD projetos + listar membros do contexto |
| `pm_tasks.go` | CRUD tarefas + mover no kanban (PATCH status) |
| `pm_members.go` | Adicionar/remover membros do projeto |
| `pm_sprints.go` | CRUD sprints |
| `pm_phases.go` | CRUD fases |
| `pm_comments.go` | Comentários de tarefas |
| `pm_audio.go` | Upload de áudio, transcrição Z.AI, observações |
| `pm_dashboard.go` | Dados analíticos para dashboard |

Criar em `backend/services/`:

| Arquivo | Responsabilidade |
|---|---|
| `zai_speech.go` | Cliente Z.AI speech-to-text (primeira integração de voz) |

### Serviço Z.AI Speech-to-Text (`services/zai_speech.go`)

A Z.AI (ZhipuAI/bigmodel.cn) expõe uma API compatível com OpenAI. O endpoint de transcrição segue o mesmo padrão do Whisper:

```go
// Endpoint: POST https://open.bigmodel.cn/api/paas/v4/audio/transcriptions
// Model: glm-4-voice (ou whisper-1 se disponível no plano)
// Autenticação: Authorization: Bearer {ZAI_API_KEY}

type ZAITranscriptionRequest struct {
    File     []byte  // arquivo de áudio (WebM/OGG/MP3)
    Model    string  // "glm-4-voice"
    Language string  // "pt" para português
}

type ZAITranscriptionResponse struct {
    Text string `json:"text"`
}

func TranscribeAudio(apiKey string, audioData []byte, filename string) (string, error) {
    // Multipart form-data POST para a API Z.AI
    // Retorna o texto transcrito
}
```

### Handler de Áudio (`handlers/pm_audio.go`)

```go
// POST /api/pm/tasks/{id}/audio
// Content-Type: multipart/form-data
// Campo "audio": arquivo binário (WebM, máx 25MB)
// Campo "duration": duração em segundos
//
// Fluxo:
// 1. Valida JWT + pertencimento ao projeto
// 2. Salva arquivo em /uploads/pm/audio/{task_id}/{uuid}.webm
// 3. Insere registro com status "processing"
// 4. Goroutine async → chama Z.AI → atualiza transcription + status "done"
// 5. Retorna ID imediatamente (frontend faz polling ou websocket futuro)

// GET /api/pm/tasks/{id}/audio
// Lista todas as notas de voz da tarefa (com transcrição e URL do áudio)

// GET /api/pm/audio/{note_id}/file
// Serve o arquivo de áudio para o player (streaming)

// PATCH /api/pm/audio/{note_id}
// Atualiza o campo "observation" (texto editado pelo usuário)

// DELETE /api/pm/audio/{note_id}
// Remove nota e arquivo do disco
```

**Padrão exato dos handlers existentes:**
```go
func ListProjectsHandler(db *sql.DB) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        companyID := r.Header.Get("X-Company-ID") // multi-tenant
        // query + json.NewEncoder(w).Encode(result)
    }
}
```

### Rotas de Áudio a registrar em `main.go`:

```
GET    /api/pm/projects
POST   /api/pm/projects
GET    /api/pm/projects/{id}
PUT    /api/pm/projects/{id}
DELETE /api/pm/projects/{id}

GET    /api/pm/projects/{id}/tasks
POST   /api/pm/projects/{id}/tasks
PUT    /api/pm/tasks/{id}
DELETE /api/pm/tasks/{id}
PATCH  /api/pm/tasks/{id}/status        ← move kanban
PATCH  /api/pm/tasks/{id}/assign

GET    /api/pm/projects/{id}/members
POST   /api/pm/projects/{id}/members
DELETE /api/pm/projects/{id}/members/{uid}

GET    /api/pm/projects/{id}/phases
POST   /api/pm/projects/{id}/phases
PUT    /api/pm/phases/{id}
DELETE /api/pm/phases/{id}

GET    /api/pm/projects/{id}/sprints
POST   /api/pm/projects/{id}/sprints
PUT    /api/pm/sprints/{id}

GET    /api/pm/tasks/{id}/comments
POST   /api/pm/tasks/{id}/comments

GET    /api/pm/tasks/{id}/audio         ← lista notas de voz
POST   /api/pm/tasks/{id}/audio         ← upload + dispara transcrição async
GET    /api/pm/audio/{note_id}/file     ← stream do arquivo de áudio (player)
PATCH  /api/pm/audio/{note_id}          ← edita observação/texto final
DELETE /api/pm/audio/{note_id}          ← remove nota e arquivo

GET    /api/pm/projects/{id}/dashboard  ← KPIs + gráficos
GET    /api/pm/projects/{id}/activity   ← log de atividade
```

Todas as rotas PM passam pelo middleware `withAuth()` existente.

---

## 3. Frontend — Estrutura de Pastas

```
src/
├── pages/pm/
│   ├── ProjectList.tsx        ← /pm  (cards de projetos)
│   ├── ProjectKanban.tsx      ← /pm/:id/kanban
│   ├── ProjectBacklog.tsx     ← /pm/:id/backlog
│   ├── ProjectDashboard.tsx   ← /pm/:id/dashboard
│   ├── ProjectMembers.tsx     ← /pm/:id/members
│   └── ProjectSettings.tsx    ← /pm/:id/settings
├── components/pm/
│   ├── KanbanBoard.tsx        ← board com 6 colunas
│   ├── KanbanColumn.tsx       ← coluna + drop zone
│   ├── TaskCard.tsx           ← card draggable
│   ├── TaskDetailSheet.tsx    ← Sheet lateral (inclui aba Observações)
│   ├── CreateTaskDialog.tsx   ← form criar/editar tarefa
│   ├── CreateProjectDialog.tsx
│   ├── PriorityBadge.tsx
│   ├── StatusBadge.tsx
│   ├── MemberAvatarGroup.tsx
│   └── AudioNoteRecorder.tsx  ← componente de gravação/transcrição de voz
└── contexts/
    └── ProjectContext.tsx     ← estado do projeto ativo
```

---

## 4. Integração na Navegação

**`src/lib/navigation.ts`** — adicionar módulo `projetos`:
```typescript
{
  id: 'projetos',
  label: 'Projetos',
  icon: 'LayoutKanban',
  path: '/pm',
  tabs: [
    { label: 'Meus Projetos', path: '/pm' },
  ]
}
```

**`src/App.tsx`** — adicionar rotas:
```tsx
<Route path="/pm" element={<ProjectList />} />
<Route path="/pm/:id/kanban" element={<ProjectKanban />} />
<Route path="/pm/:id/backlog" element={<ProjectBacklog />} />
<Route path="/pm/:id/dashboard" element={<ProjectDashboard />} />
<Route path="/pm/:id/members" element={<ProjectMembers />} />
<Route path="/pm/:id/settings" element={<ProjectSettings />} />
```

---

## 5. Kanban — 6 Colunas

| Status | Cor | Ícone |
|---|---|---|
| `backlog` | Cinza | Archive |
| `todo` | Azul | Circle |
| `in_progress` | Laranja | Timer |
| `review` | Roxo | Eye |
| `done` | Verde | CheckCircle2 |
| `blocked` | Vermelho | AlertOctagon |

Drag-and-drop via **HTML5 Drag API** nativo (sem lib extra), com PATCH para `/api/pm/tasks/{id}/status`.

---

## 6. Dashboard Executivo

**Métricas do projeto** (endpoint `/api/pm/projects/{id}/dashboard`):
- Total de tarefas por status (Donut — Recharts)
- Progresso geral (% done / total)
- Velocidade por sprint (BarChart — Recharts)
- Tarefas por responsável (HorizontalBar)
- Tarefas em atraso (due_date < hoje e não done)
- KPI cards: Total Tasks | Done | In Progress | Blocked

---

## 7. Ordem de Implementação (Sprints)

### Sprint 1 — Base (Migrations + CRUD Projetos)
1. `071` a `079` migrations (inclui `pm_task_audio_notes`)
2. `pm_projects.go` + `pm_members.go` handlers
3. Rotas em `main.go`
4. `ProjectList.tsx` (listar + criar projetos)
5. `CreateProjectDialog.tsx`

### Sprint 2 — Kanban
6. `pm_tasks.go` (CRUD + PATCH status)
7. `KanbanBoard.tsx` + `KanbanColumn.tsx` + `TaskCard.tsx`
8. `ProjectKanban.tsx`
9. `TaskDetailSheet.tsx` com comentários + aba "Observações"

### Sprint 3 — Notas de Voz com Z.AI
10. `services/zai_speech.go` — cliente de transcrição Z.AI
11. `pm_audio.go` — upload, transcrição async, serve arquivo, PATCH observação
12. `AudioNoteRecorder.tsx` — componente completo de gravação/transcrição

**Fluxo UX da gravação:**
```
Aba "Observações" na TaskDetailSheet
  ├── Lista de notas existentes (player + texto transcrito + obs editável)
  └── Botão "Gravar Nota de Voz"
      ↓
  [Microfone solicitado ao browser]
      ↓
  [Gravando...] contador de tempo + botão Stop
      ↓
  [Processando...] upload + Z.AI transcrevendo
      ↓
  [Transcrição pronta] texto editável
      ├── Campo "Observação" (pré-preenchido com transcrição)
      ├── Player para ouvir o áudio original
      └── Botão "Salvar Observação"
```

**Componente `AudioNoteRecorder.tsx`:**
- `MediaRecorder API` nativa do browser (sem lib extra)
- Formato: `audio/webm` (suporte universal em Chrome/Edge/Firefox)
- Estado: `idle | recording | uploading | transcribing | done | error`
- Polling a cada 2s em `/api/pm/tasks/{id}/audio` até `status = done`
- Player HTML5 `<audio>` nativo com a URL do arquivo

### Sprint 4 — Backlog + Sprints + Fases
13. `pm_sprints.go` + `pm_phases.go`
14. `ProjectBacklog.tsx` (lista com filtros)
15. Seletor de Sprint/Fase no formulário de tarefa

### Sprint 5 — Anexos em Tarefas (PDF + Excel + imagens)
16. Migration `080_create_pm_task_attachments.sql`
    ```sql
    CREATE TABLE pm_task_attachments (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id       UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      filename      VARCHAR(255) NOT NULL,      -- nome original
      stored_name   VARCHAR(255) NOT NULL,      -- nome em disco (uuid + ext)
      file_path     VARCHAR(500) NOT NULL,      -- /uploads/pm/attachments/{task_id}/
      file_size     BIGINT,
      mime_type     VARCHAR(100),               -- application/pdf | application/vnd.openxmlformats...
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ```
17. `pm_attachments.go` handler:
    - `POST /api/pm/tasks/{id}/attachments` — upload (PDF/Excel/imagens, máx 50MB)
    - `GET  /api/pm/tasks/{id}/attachments` — lista anexos da tarefa
    - `GET  /api/pm/attachments/{att_id}/file` — download/visualização
    - `DELETE /api/pm/attachments/{att_id}` — remove anexo + arquivo
18. `TaskAttachments.tsx` — dropzone na aba "Arquivos" da TaskDetailSheet
    - Aceita: `.pdf`, `.xlsx`, `.xls`, `.csv`, `.png`, `.jpg`
    - Exibe ícone por tipo + tamanho + botão download
    - PDF: abre em nova aba via URL do endpoint
    - Excel: download direto

### Sprint 6 — Exportação Excel
19. `pm_export.go` handler:
    - `GET /api/pm/projects/{id}/export/tasks` — exporta todas as tarefas do projeto em Excel
    - `GET /api/pm/projects/{id}/export/backlog` — exporta backlog filtrado
    - Usa biblioteca `github.com/xuri/excelize/v2` (já verificar se está no go.mod; se não, adicionar)
    - Colunas: ID, Título, Tipo, Status, Prioridade, Fase, Sprint, Responsável, Story Points, Data Vencimento, Data Criação
20. Botão "Exportar Excel" em `ProjectBacklog.tsx` e `ProjectDashboard.tsx`
    - Download via `<a href="/api/pm/projects/{id}/export/tasks" download>`

### Sprint 7 — Dashboard + Membros
21. `pm_dashboard.go` (queries analíticas)
22. `ProjectDashboard.tsx` (charts Recharts)
23. `ProjectMembers.tsx`
24. Integração no `AppRail` (novo ícone)

---

## 8. Arquivos a Modificar

| Arquivo | Mudança |
|---|---|
| `backend/main.go` | Registrar ~25 novas rotas PM (inclui áudio) |
| `backend/.env` | Confirmar `ZAI_API_KEY` (já presente) |
| `frontend/src/App.tsx` | Adicionar 6 rotas `/pm/*` |
| `frontend/src/lib/navigation.ts` | Adicionar módulo `projetos` |
| `frontend/src/components/AppRail.tsx` | Adicionar ícone Projetos |

---

## 9. Decisões Arquiteturais

| Decisão | Escolha | Motivo |
|---|---|---|
| Drag-and-drop | HTML5 nativo | Sem nova dependência |
| Estado do projeto | Context local (não global) | Escopo limitado ao módulo PM |
| ID de rota | UUID no path param | Consistente com o resto do sistema |
| Multi-tenant | `X-Company-ID` header | Padrão já estabelecido |
| Permissões PM | Somente membros do projeto acessam | Query JOIN pm_project_members |
| Paginação | Cursor (limit/offset) | Igual ao padrão existente |
| Áudio — formato | `audio/webm` via MediaRecorder | Suporte nativo em todos browsers modernos, sem lib |
| Áudio — transcrição | Z.AI async (goroutine) | Não bloqueia o upload; polling no frontend |
| Áudio — armazenamento | `/uploads/pm/audio/{task_id}/` | Mesmo volume Docker de uploads já existente |
| Áudio — modelo Z.AI | `glm-4-voice` (fallback: verificar plano) | Primeira integração de voz no projeto |
| Observação final | Campo separado da transcrição | Usuário pode editar antes de salvar |

---

## 10. O que NÃO será feito (fora do escopo inicial)

- Notificações em tempo real (WebSocket)
- Integração com calendário externo
- Dependências entre tarefas (Sprint futura)
- Transcrição em tempo real (streaming Whisper) — apenas batch por upload
