import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Plus, Download, Loader2, Search,
  ChevronDown, ChevronRight, Zap
} from 'lucide-react'
import { TaskDetailSheet } from '@/components/pm/TaskDetailSheet'
import { CreateTaskDialog } from '@/components/pm/CreateTaskDialog'
import { ProjectNav } from '@/components/pm/ProjectNav'
import { type Task } from './ProjectKanban'
import { cn } from '@/lib/utils'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Epic {
  id: string
  project_id: string
  name: string
  description: string
  order_index: number
  status: string
  color: string
  start_date: string | null
  end_date: string | null
  task_count?: number
  done_count?: number
}

// ── Constantes ────────────────────────────────────────────────────────────────

const EPIC_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  open:        { label: 'Aberto',       cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_progress: { label: 'Em andamento', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  done:        { label: 'Concluido',    cls: 'bg-green-50 text-green-700 border-green-200' },
  cancelled:   { label: 'Cancelado',    cls: 'bg-gray-50 text-gray-400 border-gray-200' },
}

const TASK_STATUS_COLORS: Record<string, string> = {
  backlog:     'bg-gray-100 text-gray-600',
  todo:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-orange-100 text-orange-700',
  review:      'bg-purple-100 text-purple-700',
  done:        'bg-green-100 text-green-700',
  blocked:     'bg-red-100 text-red-700',
  cancelled:   'bg-gray-100 text-gray-400',
}

const TASK_STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog', todo: 'A Fazer', in_progress: 'Em Andamento',
  review: 'Em Revisao', done: 'Concluido', blocked: 'Bloqueado', cancelled: 'Cancelado',
}

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-gray-300',
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function ProjectBacklog() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { token, companyId, user } = useAuth()
  const qc = useQueryClient()
  const authHeaders = { Authorization: `Bearer ${token}`, 'X-Company-ID': companyId ?? '' }

  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  // null = dialog fechado, 'uuid' = com epic pre-selecionado
  const [creatingForEpic, setCreatingForEpic] = useState<string | null>(null)

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: project } = useQuery({
    queryKey: ['pm-project', projectId],
    queryFn: async () => (await fetch(`/api/pm/projects/${projectId}`, { headers: authHeaders })).json(),
    enabled: !!projectId,
  })

  const { data: epicData, isLoading: loadingEpics } = useQuery({
    queryKey: ['pm-epics', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/pm/projects/${projectId}/epics`, { headers: authHeaders })
      if (!res.ok) return { epics: [] }
      return res.json()
    },
    enabled: !!projectId,
  })

  const { data: taskData, isLoading: loadingTasks } = useQuery({
    queryKey: ['pm-tasks-backlog', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/pm/projects/${projectId}/tasks`, { headers: authHeaders })
      if (!res.ok) return { tasks: [] }
      return res.json()
    },
    enabled: !!projectId,
  })

  const epics: Epic[] = [...(epicData?.epics ?? [])].sort(
    (a: Epic, b: Epic) => a.order_index - b.order_index
  )
  const allTasks: Task[] = taskData?.tasks ?? []

  const filteredTasks = allTasks.filter(t => {
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || t.status === statusFilter
    return matchSearch && matchStatus
  })

  const canCancel =
    user?.role === 'admin' ||
    user?.id === project?.pm_id ||
    user?.id === project?.owner_id

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['pm-tasks-backlog', projectId] })
    qc.invalidateQueries({ queryKey: ['pm-epics', projectId] })
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function tasksForEpic(epicId: string): Task[] {
    return filteredTasks.filter(t => (t as Task & { epic_id?: string | null }).epic_id === epicId)
  }

  function tasksWithoutEpic(): Task[] {
    return filteredTasks.filter(t => !(t as Task & { epic_id?: string | null }).epic_id)
  }

  function exportBacklog() {
    const a = document.createElement('a')
    a.href = `/api/pm/projects/${projectId}/export/tasks`
    a.click()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const orphans = tasksWithoutEpic()
  const isLoading = loadingEpics || loadingTasks

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      <ProjectNav projectId={projectId!} projectName={project?.name} />

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative min-w-[160px] max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-xs"
            placeholder="Buscar tarefa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs w-40">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="" className="text-xs">Todos os status</SelectItem>
            <SelectItem value="backlog"     className="text-xs">Backlog</SelectItem>
            <SelectItem value="todo"        className="text-xs">A Fazer</SelectItem>
            <SelectItem value="in_progress" className="text-xs">Em Andamento</SelectItem>
            <SelectItem value="review"      className="text-xs">Em Revisao</SelectItem>
            <SelectItem value="done"        className="text-xs">Concluido</SelectItem>
            <SelectItem value="blocked"     className="text-xs">Bloqueado</SelectItem>
            <SelectItem value="cancelled"   className="text-xs">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exportBacklog}>
          <Download className="h-3.5 w-3.5 mr-1" /> Excel
        </Button>
        {epics.length > 0 ? (
          <Button size="sm" className="h-7 text-xs" onClick={() => setCreatingForEpic(epics[0].id)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nova Tarefa
          </Button>
        ) : (
          <Button size="sm" className="h-7 text-xs" onClick={() => navigate(`/pm/${projectId}/epics`)}>
            <Zap className="h-3.5 w-3.5 mr-1" /> Criar Epicos
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : epics.length === 0 ? (
        /* Empty state — no epics yet */
        <div className="rounded-lg border border-dashed p-8 text-center space-y-2">
          <Zap className="h-6 w-6 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">
            Nenhum epico criado. Crie epicos primeiro para organizar as tarefas do projeto.
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate(`/pm/${projectId}/epics`)}>
            <Zap className="h-3.5 w-3.5 mr-1" /> Ir para Epicos
          </Button>
        </div>
      ) : (
        <div className="space-y-2">

          {/* Epic sections — read-only grouping */}
          {epics.map(epic => {
            const epicTasks = tasksForEpic(epic.id)
            return (
              <EpicSection
                key={epic.id}
                epic={epic}
                tasks={epicTasks}
                isOpen={expanded.has(epic.id)}
                onToggle={() => toggleExpand(epic.id)}
                onAddTask={() => {
                  setCreatingForEpic(epic.id)
                  setExpanded(prev => new Set([...prev, epic.id]))
                }}
                onSelectTask={setSelectedTask}
              />
            )
          })}

          {/* Tarefas orfas (sem epic) — somente se existirem */}
          {orphans.length > 0 && (
            <div className="rounded-lg border bg-white overflow-hidden">
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/20 select-none"
                onClick={() => toggleExpand('__no_epic__')}
              >
                <span className="text-muted-foreground">
                  {expanded.has('__no_epic__')
                    ? <ChevronDown className="h-4 w-4" />
                    : <ChevronRight className="h-4 w-4" />}
                </span>
                <span className="w-3 h-3 rounded-full shrink-0 bg-gray-300" />
                <span className="text-sm font-medium flex-1 text-muted-foreground">Sem epico (legado)</span>
                <span className="text-xs text-muted-foreground mr-2">
                  {orphans.length} tarefa{orphans.length !== 1 ? 's' : ''}
                </span>
              </div>
              {expanded.has('__no_epic__') && (
                <div className="border-t">
                  <TaskTable tasks={orphans} onSelect={setSelectedTask} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Task detail */}
      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          open={true}
          onClose={() => setSelectedTask(null)}
          onUpdated={() => { invalidate(); setSelectedTask(null) }}
          canCancel={canCancel}
        />
      )}

      {/* Create task — epic pre-selected */}
      {creatingForEpic !== null && (
        <CreateTaskDialog
          projectId={projectId!}
          open={true}
          defaultEpicId={creatingForEpic}
          onClose={() => setCreatingForEpic(null)}
          onCreated={() => { invalidate(); setCreatingForEpic(null) }}
        />
      )}
    </div>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

interface EpicSectionProps {
  epic: Epic
  tasks: Task[]
  isOpen: boolean
  onToggle: () => void
  onAddTask: () => void
  onSelectTask: (t: Task) => void
}

function EpicSection({ epic, tasks, isOpen, onToggle, onAddTask, onSelectTask }: EpicSectionProps) {
  const total = epic.task_count ?? tasks.length
  const done  = epic.done_count ?? tasks.filter(t => t.status === 'done').length
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0
  const cfg   = EPIC_STATUS_CFG[epic.status] ?? { label: epic.status, cls: '' }

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/20 select-none"
        onClick={onToggle}
      >
        <span className="text-muted-foreground">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: epic.color }} />
        <span className="text-sm font-semibold flex-1 truncate">{epic.name}</span>
        {epic.description && (
          <span className="text-xs text-muted-foreground hidden lg:block truncate max-w-[200px]">
            {epic.description}
          </span>
        )}
        <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 h-4 shrink-0', cfg.cls)}>
          {cfg.label}
        </Badge>
        {total > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-14 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{done}/{total}</span>
          </div>
        )}
        {total === 0 && (
          <span className="text-xs text-muted-foreground shrink-0">0 tarefas</span>
        )}
        <div
          className="shrink-0"
          onClick={e => e.stopPropagation()}
        >
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Adicionar tarefa" onClick={onAddTask}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="border-t">
          {tasks.length === 0 ? (
            <div className="py-5 text-center text-xs text-muted-foreground">
              Nenhuma tarefa neste epico.{' '}
              <button className="underline text-primary" onClick={onAddTask}>
                Criar tarefa
              </button>
            </div>
          ) : (
            <TaskTable tasks={tasks} onSelect={onSelectTask} />
          )}
        </div>
      )}
    </div>
  )
}

function TaskTable({ tasks, onSelect }: { tasks: Task[]; onSelect: (t: Task) => void }) {
  return (
    <table className="w-full text-xs">
      <thead className="border-b bg-muted/20">
        <tr>
          <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-[42%]">Titulo</th>
          <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Status</th>
          <th className="text-left px-3 py-1.5 font-medium text-muted-foreground hidden sm:table-cell">Tipo</th>
          <th className="text-left px-3 py-1.5 font-medium text-muted-foreground hidden md:table-cell">Responsavel</th>
          <th className="text-right px-3 py-1.5 font-medium text-muted-foreground hidden md:table-cell">Venc.</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((task, i) => {
          const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'
          const isCancelled = task.status === 'cancelled'
          return (
            <tr
              key={task.id}
              className={cn(
                'border-b last:border-b-0 cursor-pointer hover:bg-muted/20 transition-colors',
                i % 2 === 0 ? '' : 'bg-muted/5',
                isCancelled && 'opacity-50'
              )}
              onClick={() => onSelect(task)}
            >
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full shrink-0', PRIORITY_DOT[task.priority] ?? 'bg-gray-300')} />
                  <span className={cn('font-medium truncate', isCancelled && 'line-through text-muted-foreground')}>
                    {task.title}
                  </span>
                  {task.comment_count > 0 && (
                    <span className="text-muted-foreground shrink-0">{task.comment_count}💬</span>
                  )}
                  {task.attachment_count > 0 && (
                    <span className="text-muted-foreground shrink-0">{task.attachment_count}📎</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-1.5">
                <Badge
                  className={cn('text-[10px] px-1.5 py-0', TASK_STATUS_COLORS[task.status] ?? '')}
                  variant="outline"
                >
                  {TASK_STATUS_LABEL[task.status] ?? task.status}
                </Badge>
              </td>
              <td className="px-3 py-1.5 text-muted-foreground hidden sm:table-cell">
                {TASK_TYPE_LABELS[task.type] ?? task.type}
              </td>
              <td className="px-3 py-1.5 text-muted-foreground hidden md:table-cell">
                {task.assignee_name || '—'}
              </td>
              <td className={cn(
                'px-3 py-1.5 text-right hidden md:table-cell',
                isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'
              )}>
                {task.due_date ? new Date(task.due_date).toLocaleDateString('pt-BR') : '—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// Exportado para reuso em outros componentes
export const TASK_TYPE_LABELS: Record<string, string> = {
  task:          'Tarefa',
  story:         'Historia',
  bug:           'Bug / Defeito',
  improvement:   'Melhoria',
  risk:          'Risco',
  deliverable:   'Entrega',
  meeting:       'Reuniao',
  test:          'Teste',
  document:      'Documento',
  training:      'Treinamento',
  configuration: 'Configuracao',
  development:   'Desenvolvimento',
}
