import { useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Plus, Loader2,
  AlertOctagon, Circle, Timer, Eye, CheckCircle2, Archive
} from 'lucide-react'
import { TaskDetailSheet } from '@/components/pm/TaskDetailSheet'
import { CreateTaskDialog } from '@/components/pm/CreateTaskDialog'
import { ProjectNav } from '@/components/pm/ProjectNav'
import { TASK_TYPE_LABELS } from './ProjectBacklog'
import { cn } from '@/lib/utils'

export interface Task {
  id: string
  project_id: string
  phase_id: string | null
  sprint_id: string | null
  epic_id: string | null
  title: string
  description: string
  status: string
  priority: string
  type: string
  assigned_to: string | null
  assignee_name: string
  reporter_id: string | null
  reporter_name: string
  story_points: number | null
  due_date: string | null
  order_index: number
  created_at: string
  updated_at: string
  comment_count: number
  attachment_count: number
  audio_count: number
}

const COLUMNS = [
  { id: 'backlog',     label: 'Backlog',      icon: Archive,       color: 'text-gray-500',  bg: 'bg-gray-50',    border: 'border-gray-200' },
  { id: 'todo',        label: 'A Fazer',       icon: Circle,        color: 'text-blue-500',  bg: 'bg-blue-50',    border: 'border-blue-200' },
  { id: 'in_progress', label: 'Em Andamento',  icon: Timer,         color: 'text-orange-500',bg: 'bg-orange-50',  border: 'border-orange-200' },
  { id: 'review',      label: 'Em Revisão',    icon: Eye,           color: 'text-purple-500',bg: 'bg-purple-50',  border: 'border-purple-200' },
  { id: 'done',        label: 'Concluído',     icon: CheckCircle2,  color: 'text-green-500', bg: 'bg-green-50',   border: 'border-green-200' },
  { id: 'blocked',     label: 'Bloqueado',     icon: AlertOctagon,  color: 'text-red-500',   bg: 'bg-red-50',     border: 'border-red-200' },
  { id: 'cancelled',   label: 'Cancelado',     icon: Ban,           color: 'text-gray-400',  bg: 'bg-gray-50',    border: 'border-gray-200' },
]

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-400',
  medium:   'bg-yellow-400',
  low:      'bg-gray-300',
}

const TYPE_LABELS = TASK_TYPE_LABELS

export default function ProjectKanban() {
  const { id: projectId } = useParams<{ id: string }>()
  const { token, companyId, user } = useAuth()
  const qc = useQueryClient()
  const authHeaders = { Authorization: `Bearer ${token}`, 'X-Company-ID': companyId ?? '' }

  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [createStatus, setCreateStatus] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const dragOver = useRef<string | null>(null)

  const { data: projectData } = useQuery({
    queryKey: ['pm-project', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/pm/projects/${projectId}`, { headers: authHeaders })
      if (!res.ok) throw new Error('Erro')
      return res.json()
    },
    enabled: !!projectId,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['pm-tasks', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/pm/projects/${projectId}/tasks`, { headers: authHeaders })
      if (!res.ok) throw new Error('Erro ao carregar tarefas')
      return res.json()
    },
    enabled: !!projectId,
    refetchInterval: 30000,
  })

  const tasks: Task[] = data?.tasks ?? []

  async function moveTask(taskId: string, newStatus: string) {
    const task = tasks.find(t => t.id === taskId)
    if (!task || task.status === newStatus) return
    try {
      await fetch(`/api/pm/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      qc.invalidateQueries({ queryKey: ['pm-tasks', projectId] })
    } catch {
      toast.error('Erro ao mover tarefa')
    }
  }

  function onDragStart(taskId: string) {
    setDragging(taskId)
  }

  function onDragEnd() {
    if (dragging && dragOver.current) {
      moveTask(dragging, dragOver.current)
    }
    setDragging(null)
    dragOver.current = null
  }

  function onDragOver(e: React.DragEvent, colId: string) {
    e.preventDefault()
    dragOver.current = colId
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <ProjectNav projectId={projectId!} projectName={projectData?.name} />
      <div className="flex justify-end mb-2 shrink-0">
        <Button size="sm" className="h-7 text-xs"
          onClick={() => setCreateStatus('todo')}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nova Tarefa
        </Button>
      </div>

      {/* Kanban board */}
      {isLoading ? (
        <div className="flex justify-center items-center flex-1">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex gap-3 flex-1 overflow-x-auto pb-2">
          {COLUMNS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.id)
            const ColIcon = col.icon
            return (
              <div
                key={col.id}
                className={cn(
                  'flex flex-col rounded-xl border min-w-[220px] w-[220px] shrink-0',
                  col.bg, col.border
                )}
                onDragOver={e => onDragOver(e, col.id)}
                onDrop={onDragEnd}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <ColIcon className={cn('h-3.5 w-3.5', col.color)} />
                    <span className="text-xs font-semibold text-foreground">{col.label}</span>
                    <span className="text-[10px] text-muted-foreground bg-white rounded-full px-1.5 py-0.5 font-medium border">
                      {colTasks.length}
                    </span>
                  </div>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setCreateStatus(col.id)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2 px-2 pb-2 overflow-y-auto flex-1">
                  {colTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onDragStart={() => onDragStart(task.id)}
                      onDragEnd={onDragEnd}
                      onClick={() => setSelectedTask(task)}
                    />
                  ))}
                  {colTasks.length === 0 && (
                    <div
                      className="flex items-center justify-center h-16 rounded-lg border-2 border-dashed border-muted/40 cursor-pointer hover:border-muted/60 transition-colors"
                      onClick={() => setCreateStatus(col.id)}
                    >
                      <Plus className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Task Detail Sheet */}
      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          open={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdated={() => {
            qc.invalidateQueries({ queryKey: ['pm-tasks', projectId] })
            setSelectedTask(null)
          }}
          canCancel={
            user?.role === 'admin' ||
            user?.id === projectData?.pm_id ||
            user?.id === projectData?.owner_id
          }
        />
      )}

      {/* Create Task Dialog */}
      {createStatus && (
        <CreateTaskDialog
          projectId={projectId!}
          defaultStatus={createStatus}
          open={!!createStatus}
          onClose={() => setCreateStatus(null)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['pm-tasks', projectId] })
            setCreateStatus(null)
          }}
        />
      )}
    </div>
  )
}

// ── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({
  task, onDragStart, onDragEnd, onClick
}: {
  task: Task
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
}) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="bg-white rounded-lg border border-border p-2.5 cursor-pointer
                 hover:shadow-md hover:border-primary/30 transition-all
                 active:opacity-70 select-none"
    >
      {/* Priority dot + type */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={cn('w-2 h-2 rounded-full shrink-0', PRIORITY_COLORS[task.priority] ?? 'bg-gray-300')} />
        <span className="text-[10px] text-muted-foreground">{TYPE_LABELS[task.type] ?? task.type}</span>
        {task.story_points != null && (
          <span className="ml-auto text-[10px] bg-gray-100 text-gray-500 rounded px-1">
            {task.story_points}pts
          </span>
        )}
      </div>

      {/* Title */}
      <p className="text-xs font-medium leading-tight line-clamp-2 text-foreground">{task.title}</p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5">
          {task.comment_count > 0 && (
            <span className="text-[10px] text-muted-foreground">{task.comment_count} 💬</span>
          )}
          {task.attachment_count > 0 && (
            <span className="text-[10px] text-muted-foreground">{task.attachment_count} 📎</span>
          )}
          {task.audio_count > 0 && (
            <span className="text-[10px] text-muted-foreground">{task.audio_count} 🎙</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isOverdue && (
            <Badge className="text-[9px] px-1 py-0 bg-red-100 text-red-600 border-red-200" variant="outline">
              Atrasado
            </Badge>
          )}
          {task.assignee_name && (
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[9px] font-bold">
              {task.assignee_name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
