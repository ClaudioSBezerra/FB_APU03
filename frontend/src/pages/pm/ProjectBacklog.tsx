import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Plus, Download, Loader2, Search,
  ChevronDown, ChevronRight,
  Pencil, Trash2, Zap
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
  open:        { label: 'Aberto',        cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_progress: { label: 'Em andamento',  cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  done:        { label: 'Concluido',     cls: 'bg-green-50 text-green-700 border-green-200' },
  cancelled:   { label: 'Cancelado',     cls: 'bg-gray-50 text-gray-400 border-gray-200' },
}

const EPIC_COLORS = [
  { value: '#6366f1', label: 'Indigo' },
  { value: '#3b82f6', label: 'Azul' },
  { value: '#10b981', label: 'Verde' },
  { value: '#f59e0b', label: 'Ambar' },
  { value: '#ef4444', label: 'Vermelho' },
  { value: '#8b5cf6', label: 'Roxo' },
  { value: '#06b6d4', label: 'Ciano' },
  { value: '#f97316', label: 'Laranja' },
]

const TASK_STATUS_COLORS: Record<string, string> = {
  backlog:     'bg-gray-100 text-gray-600',
  todo:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-orange-100 text-orange-700',
  review:      'bg-purple-100 text-purple-700',
  done:        'bg-green-100 text-green-700',
  blocked:     'bg-red-100 text-red-700',
  cancelled:   'bg-gray-100 text-gray-400 line-through',
}

const TASK_STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog', todo: 'A Fazer', in_progress: 'Em Andamento',
  review: 'Em Revisao', done: 'Concluido', blocked: 'Bloqueado', cancelled: 'Cancelado',
}

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-gray-300',
}

const TYPE_LABELS: Record<string, string> = {
  story: 'Historia', task: 'Tarefa', bug: 'Bug', improvement: 'Melhoria', risk: 'Risco',
}

const emptyEpicForm = {
  name: '', description: '', color: '#6366f1',
  status: 'open', start_date: '', end_date: '', order_index: 0,
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function ProjectBacklog() {
  const { id: projectId } = useParams<{ id: string }>()
  const { token, companyId, user } = useAuth()
  const qc = useQueryClient()
  const authHeaders = { Authorization: `Bearer ${token}`, 'X-Company-ID': companyId ?? '' }

  // filtros
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // task detail
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  // criar tarefa (com epic pre-selecionado)
  const [creatingForEpic, setCreatingForEpic] = useState<string | null>(null)

  // epics expandidos
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // dialog de epic
  const [epicDialog, setEpicDialog]   = useState<'create' | 'edit' | null>(null)
  const [selEpic, setSelEpic]         = useState<Epic | null>(null)
  const [epicForm, setEpicForm]       = useState(emptyEpicForm)
  const [savingEpic, setSavingEpic]   = useState(false)

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: project } = useQuery({
    queryKey: ['pm-project', projectId],
    queryFn: async () => (await fetch(`/api/pm/projects/${projectId}`, { headers: authHeaders })).json(),
    enabled: !!projectId,
  })

  const { data: epicData, isLoading: loadingEpics } = useQuery({
    queryKey: ['pm-epics', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/pm/projects/${projectId}/epics`, { headers: authHeaders })
      if (!res.ok) throw new Error('Erro ao carregar epicos')
      return res.json()
    },
    enabled: !!projectId,
  })

  const { data: taskData, isLoading: loadingTasks } = useQuery({
    queryKey: ['pm-tasks', projectId, 'backlog-all'],
    queryFn: async () => {
      const res = await fetch(`/api/pm/projects/${projectId}/tasks`, { headers: authHeaders })
      return res.json()
    },
    enabled: !!projectId,
  })

  const epics: Epic[] = [...(epicData?.epics ?? [])].sort(
    (a: Epic, b: Epic) => a.order_index - b.order_index
  )

  const allTasks: (Task & { epic_id?: string | null })[] = taskData?.tasks ?? []

  // filtra por texto e status
  const filteredTasks = allTasks.filter(t => {
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || t.status === statusFilter
    return matchSearch && matchStatus
  })

  const canCancel =
    user?.role === 'admin' ||
    user?.id === project?.pm_id ||
    user?.id === project?.owner_id

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function tasksForEpic(epicId: string | null) {
    return filteredTasks.filter(t =>
      epicId === null ? !t.epic_id : t.epic_id === epicId
    )
  }

  function exportBacklog() {
    const a = document.createElement('a')
    a.href = `/api/pm/projects/${projectId}/export/tasks`
    a.click()
  }

  // ── Epic CRUD ─────────────────────────────────────────────────────────────────

  function openCreateEpic() {
    setEpicForm({ ...emptyEpicForm, order_index: epics.length })
    setSelEpic(null)
    setEpicDialog('create')
  }

  function openEditEpic(e: Epic) {
    setEpicForm({
      name: e.name, description: e.description ?? '',
      color: e.color ?? '#6366f1', status: e.status,
      start_date: e.start_date ?? '', end_date: e.end_date ?? '',
      order_index: e.order_index,
    })
    setSelEpic(e)
    setEpicDialog('edit')
  }

  async function handleSaveEpic() {
    if (!epicForm.name.trim()) { toast.error('Nome e obrigatorio'); return }
    setSavingEpic(true)
    try {
      const url    = epicDialog === 'edit'
        ? `/api/pm/projects/${projectId}/epics/${selEpic!.id}`
        : `/api/pm/projects/${projectId}/epics`
      const method = epicDialog === 'edit' ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...epicForm,
          start_date: epicForm.start_date || null,
          end_date: epicForm.end_date || null,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      toast.success(epicDialog === 'edit' ? 'Epico atualizado!' : 'Epico criado!')
      qc.invalidateQueries({ queryKey: ['pm-epics', projectId] })
      setEpicDialog(null)
      // expande o epic criado
      if (epicDialog === 'create') {
        const d = await res.json().catch(() => null)
        if (d?.id) setExpanded(prev => new Set([...prev, d.id]))
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSavingEpic(false)
    }
  }

  async function handleDeleteEpic(e: Epic) {
    if (!confirm(`Excluir epico "${e.name}"? As tarefas nao serao removidas.`)) return
    try {
      const res = await fetch(`/api/pm/projects/${projectId}/epics/${e.id}`, {
        method: 'DELETE', headers: authHeaders,
      })
      if (!res.ok) throw new Error()
      toast.success('Epico excluido')
      qc.invalidateQueries({ queryKey: ['pm-epics', projectId] })
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  const isLoading = loadingEpics || loadingTasks

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      <ProjectNav projectId={projectId!} projectName={project?.name} />

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
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
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openCreateEpic}>
          <Zap className="h-3.5 w-3.5 mr-1" /> Novo Epico
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={() => setCreatingForEpic('')}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nova Tarefa
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {/* ── Epicos ──────────────────────────────────────────────────────── */}
          {epics.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center space-y-2">
              <Zap className="h-6 w-6 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Nenhum epico criado. Epicos organizam as tarefas por iniciativas ou modulos.
              </p>
              <Button size="sm" variant="outline" onClick={openCreateEpic}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Criar primeiro epico
              </Button>
            </div>
          )}

          {epics.map(epic => {
            const isOpen  = expanded.has(epic.id)
            const tasks   = tasksForEpic(epic.id)
            const total   = epic.task_count ?? tasks.length
            const done    = epic.done_count ?? tasks.filter(t => t.status === 'done').length
            const pct     = total > 0 ? Math.round((done / total) * 100) : 0
            const cfg     = EPIC_STATUS_CFG[epic.status] ?? { label: epic.status, cls: '' }

            return (
              <div key={epic.id} className="rounded-lg border bg-white overflow-hidden">
                {/* Epic header */}
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/20 select-none"
                  onClick={() => toggleExpand(epic.id)}
                >
                  <span className="text-muted-foreground">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: epic.color }}
                  />
                  <span className="text-sm font-semibold flex-1 truncate">{epic.name}</span>
                  {epic.description && (
                    <span className="text-xs text-muted-foreground hidden md:block truncate max-w-[220px]">
                      {epic.description}
                    </span>
                  )}
                  <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 h-4 shrink-0', cfg.cls)}>
                    {cfg.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground shrink-0 w-16 text-right">
                    {done}/{total} tarefas
                  </span>
                  <div className="w-20 shrink-0 hidden sm:block">
                    <Progress value={pct} className="h-1.5" />
                  </div>
                  {/* Epic actions — stop propagation so não colapsa */}
                  <div
                    className="flex items-center gap-0.5 shrink-0"
                    onClick={e => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6"
                      title="Adicionar tarefa neste epico"
                      onClick={() => {
                        setCreatingForEpic(epic.id)
                        setExpanded(prev => new Set([...prev, epic.id]))
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6"
                      onClick={() => openEditEpic(epic)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 text-red-500 hover:text-red-600"
                      onClick={() => handleDeleteEpic(epic)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Epic tasks */}
                {isOpen && (
                  <div className="border-t">
                    {tasks.length === 0 ? (
                      <div className="py-6 text-center text-xs text-muted-foreground">
                        Nenhuma tarefa neste epico.{' '}
                        <button
                          className="underline text-primary"
                          onClick={() => setCreatingForEpic(epic.id)}
                        >
                          Criar tarefa
                        </button>
                      </div>
                    ) : (
                      <TaskTable
                        tasks={tasks}
                        onSelect={setSelectedTask}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* ── Tarefas sem epico ────────────────────────────────────────────── */}
          {(() => {
            const orphans = tasksForEpic(null)
            if (orphans.length === 0 && epics.length > 0) return null
            const isOpen = expanded.has('__no_epic__')
            return (
              <div className="rounded-lg border bg-white overflow-hidden">
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/20 select-none"
                  onClick={() => toggleExpand('__no_epic__')}
                >
                  <span className="text-muted-foreground">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                  <span className="w-3 h-3 rounded-full shrink-0 bg-gray-300" />
                  <span className="text-sm font-medium flex-1 text-muted-foreground">
                    Sem epico
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {orphans.length} tarefa{orphans.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {isOpen && (
                  <div className="border-t">
                    {orphans.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        Nenhuma tarefa sem epico.
                      </div>
                    ) : (
                      <TaskTable tasks={orphans} onSelect={setSelectedTask} />
                    )}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Dialog Epico ──────────────────────────────────────────────────────── */}
      <Dialog open={!!epicDialog} onOpenChange={o => { if (!o) setEpicDialog(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{epicDialog === 'edit' ? 'Editar Epico' : 'Novo Epico'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Nome *</Label>
              <Input
                value={epicForm.name}
                onChange={e => setEpicForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Modulo Financeiro"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Descricao</Label>
              <Textarea
                rows={2}
                value={epicForm.description}
                onChange={e => setEpicForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Objetivo deste epico..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select value={epicForm.status} onValueChange={v => setEpicForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open"        className="text-xs">Aberto</SelectItem>
                    <SelectItem value="in_progress" className="text-xs">Em andamento</SelectItem>
                    <SelectItem value="done"        className="text-xs">Concluido</SelectItem>
                    <SelectItem value="cancelled"   className="text-xs">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Cor</Label>
                <div className="flex gap-2 flex-wrap pt-1">
                  {EPIC_COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      title={c.label}
                      className={cn(
                        'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
                        epicForm.color === c.value ? 'border-foreground scale-110' : 'border-transparent'
                      )}
                      style={{ backgroundColor: c.value }}
                      onClick={() => setEpicForm(f => ({ ...f, color: c.value }))}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Inicio</Label>
                <Input
                  type="date" className="text-xs"
                  value={epicForm.start_date}
                  onChange={e => setEpicForm(f => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Termino</Label>
                <Input
                  type="date" className="text-xs"
                  value={epicForm.end_date}
                  onChange={e => setEpicForm(f => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEpicDialog(null)}>Cancelar</Button>
            <Button onClick={handleSaveEpic} disabled={savingEpic}>
              {savingEpic ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {epicDialog === 'edit' ? 'Salvar' : 'Criar Epico'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Task detail ───────────────────────────────────────────────────────── */}
      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          open={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdated={() => {
            qc.invalidateQueries({ queryKey: ['pm-tasks', projectId, 'backlog-all'] })
            qc.invalidateQueries({ queryKey: ['pm-epics', projectId] })
            setSelectedTask(null)
          }}
          canCancel={canCancel}
        />
      )}

      {/* ── Create task ───────────────────────────────────────────────────────── */}
      {creatingForEpic !== null && (
        <CreateTaskDialog
          projectId={projectId!}
          open={true}
          defaultEpicId={creatingForEpic || undefined}
          onClose={() => setCreatingForEpic(null)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['pm-tasks', projectId, 'backlog-all'] })
            qc.invalidateQueries({ queryKey: ['pm-epics', projectId] })
            setCreatingForEpic(null)
          }}
        />
      )}
    </div>
  )
}

// ── Tabela de tarefas (sub-componente) ────────────────────────────────────────

function TaskTable({
  tasks,
  onSelect,
}: {
  tasks: (Task & { epic_id?: string | null })[]
  onSelect: (t: Task) => void
}) {
  return (
    <table className="w-full text-xs">
      <thead className="border-b bg-muted/20">
        <tr>
          <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-[40%]">Titulo</th>
          <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Status</th>
          <th className="text-left px-3 py-1.5 font-medium text-muted-foreground hidden sm:table-cell">Tipo</th>
          <th className="text-left px-3 py-1.5 font-medium text-muted-foreground hidden md:table-cell">Responsavel</th>
          <th className="text-right px-3 py-1.5 font-medium text-muted-foreground hidden md:table-cell">Venc.</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((task, i) => {
          const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'
          return (
            <tr
              key={task.id}
              className={cn(
                'border-b last:border-b-0 cursor-pointer hover:bg-muted/20 transition-colors',
                i % 2 === 0 ? '' : 'bg-muted/5',
                task.status === 'cancelled' ? 'opacity-50' : ''
              )}
              onClick={() => onSelect(task)}
            >
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full shrink-0', PRIORITY_DOT[task.priority] ?? 'bg-gray-300')} />
                  <span className={cn('font-medium truncate', task.status === 'cancelled' && 'line-through text-muted-foreground')}>
                    {task.title}
                  </span>
                  {task.comment_count > 0 && <span className="text-muted-foreground shrink-0">{task.comment_count}💬</span>}
                  {task.attachment_count > 0 && <span className="text-muted-foreground shrink-0">{task.attachment_count}📎</span>}
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
                {TYPE_LABELS[task.type] ?? task.type}
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
