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
  Plus, LayoutKanban, LayoutDashboard, Users, Download, Loader2, Search
} from 'lucide-react'
import { TaskDetailSheet } from '@/components/pm/TaskDetailSheet'
import { CreateTaskDialog } from '@/components/pm/CreateTaskDialog'
import { type Task } from './ProjectKanban'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'backlog',     label: 'Backlog' },
  { value: 'todo',        label: 'A Fazer' },
  { value: 'in_progress', label: 'Em Andamento' },
  { value: 'review',      label: 'Em Revisão' },
  { value: 'done',        label: 'Concluído' },
  { value: 'blocked',     label: 'Bloqueado' },
]

const STATUS_COLORS: Record<string, string> = {
  backlog:     'bg-gray-100 text-gray-600',
  todo:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-orange-100 text-orange-700',
  review:      'bg-purple-100 text-purple-700',
  done:        'bg-green-100 text-green-700',
  blocked:     'bg-red-100 text-red-700',
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-gray-300',
}

const TYPE_LABELS: Record<string, string> = {
  story: 'História', task: 'Tarefa', bug: 'Bug', improvement: 'Melhoria', risk: 'Risco',
}

export default function ProjectBacklog() {
  const { id: projectId } = useParams<{ id: string }>()
  const { token, companyId } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const authHeaders = { Authorization: `Bearer ${token}`, 'X-Company-ID': companyId ?? '' }

  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [creating, setCreating] = useState(false)

  const { data: project } = useQuery({
    queryKey: ['pm-project', projectId],
    queryFn: async () => (await fetch(`/api/pm/projects/${projectId}`, { headers: authHeaders })).json(),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['pm-tasks', projectId, statusFilter],
    queryFn: async () => {
      const params = statusFilter ? `?status=${statusFilter}` : ''
      const res = await fetch(`/api/pm/projects/${projectId}/tasks${params}`, { headers: authHeaders })
      return res.json()
    },
    enabled: !!projectId,
  })

  const tasks: Task[] = (data?.tasks ?? []).filter((t: Task) =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  )

  function exportBacklog() {
    const a = document.createElement('a')
    a.href = `/api/pm/projects/${projectId}/export/tasks`
    a.click()
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Sub-header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button onClick={() => navigate('/pm')} className="hover:text-foreground">Projetos</button>
          <span>/</span>
          <span className="font-semibold text-foreground truncate max-w-[200px]">{project?.name ?? '...'}</span>
          <span>/</span>
          <span>Backlog</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs"
            onClick={() => navigate(`/pm/${projectId}/kanban`)}>
            <LayoutKanban className="h-3.5 w-3.5 mr-1" /> Kanban
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs"
            onClick={() => navigate(`/pm/${projectId}/dashboard`)}>
            <LayoutDashboard className="h-3.5 w-3.5 mr-1" /> Dashboard
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs"
            onClick={() => navigate(`/pm/${projectId}/members`)}>
            <Users className="h-3.5 w-3.5 mr-1" /> Equipe
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={exportBacklog}>
            <Download className="h-3.5 w-3.5 mr-1" /> Excel
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nova Tarefa
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-xs"
            placeholder="Buscar tarefa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-sm text-muted-foreground">Nenhuma tarefa encontrada.</p>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> Criar Tarefa
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-xs">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-1/2">Título</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Prioridade</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Tipo</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">Responsável</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">Venc.</th>
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
                      i % 2 === 0 ? '' : 'bg-muted/5'
                    )}
                    onClick={() => setSelectedTask(task)}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={cn('w-2 h-2 rounded-full shrink-0', PRIORITY_COLORS[task.priority] ?? 'bg-gray-300')} />
                        <span className="font-medium truncate">{task.title}</span>
                        {task.comment_count > 0 && (
                          <span className="text-muted-foreground shrink-0">{task.comment_count}💬</span>
                        )}
                        {task.attachment_count > 0 && (
                          <span className="text-muted-foreground shrink-0">{task.attachment_count}📎</span>
                        )}
                        {task.audio_count > 0 && (
                          <span className="text-muted-foreground shrink-0">{task.audio_count}🎙</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={cn('text-[10px] px-1.5 py-0', STATUS_COLORS[task.status] ?? '')} variant="outline">
                        {STATUS_OPTIONS.find(s => s.value === task.status)?.label ?? task.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground capitalize">{task.priority}</td>
                    <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">
                      {TYPE_LABELS[task.type] ?? task.type}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">
                      {task.assignee_name || '—'}
                    </td>
                    <td className={cn('px-3 py-2 text-right hidden md:table-cell', isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground')}>
                      {task.due_date ? new Date(task.due_date).toLocaleDateString('pt-BR') : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          open={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdated={() => {
            qc.invalidateQueries({ queryKey: ['pm-tasks', projectId] })
            setSelectedTask(null)
          }}
        />
      )}

      {creating && (
        <CreateTaskDialog
          projectId={projectId!}
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['pm-tasks', projectId] })
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}
