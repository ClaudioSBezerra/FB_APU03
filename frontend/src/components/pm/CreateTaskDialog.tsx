import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  projectId: string
  defaultStatus?: string
  defaultEpicId?: string
  open: boolean
  onClose: () => void
  onCreated: () => void
}

const NONE = '__none__'

export function CreateTaskDialog({ projectId, defaultStatus = 'backlog', defaultEpicId, open, onClose, onCreated }: Props) {
  const { token, companyId } = useAuth()
  const headers = { Authorization: `Bearer ${token}`, 'X-Company-ID': companyId ?? '' }
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '', description: '', status: defaultStatus,
    priority: 'medium', type: 'task',
    story_points: '', due_date: '',
    sprint_id: NONE, phase_id: NONE, epic_id: defaultEpicId ?? NONE, assigned_to: NONE,
  })

  // Reseta o form sempre que o dialog abre ou o épico padrão muda
  useEffect(() => {
    if (open) {
      setForm({
        title: '', description: '', status: defaultStatus,
        priority: 'medium', type: 'task',
        story_points: '', due_date: '',
        sprint_id: NONE, phase_id: NONE, epic_id: defaultEpicId ?? NONE, assigned_to: NONE,
      })
    }
  }, [open, defaultEpicId, defaultStatus])

  const { data: sprintsData } = useQuery({
    queryKey: ['pm-sprints', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/pm/projects/${projectId}/sprints`, { headers })
      return res.json()
    },
    enabled: open && !!projectId,
  })

  const { data: phasesData } = useQuery({
    queryKey: ['pm-phases', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/pm/projects/${projectId}/phases`, { headers })
      return res.json()
    },
    enabled: open && !!projectId,
  })

  const { data: epicsData } = useQuery({
    queryKey: ['pm-epics', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/pm/projects/${projectId}/epics`, { headers })
      return res.json()
    },
    enabled: open && !!projectId,
  })

  const { data: membersData } = useQuery({
    queryKey: ['pm-members', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/pm/projects/${projectId}/members`, { headers })
      return res.json()
    },
    enabled: open && !!projectId,
  })

  const sprints = sprintsData?.sprints ?? []
  const phases  = phasesData?.phases ?? []
  const epics   = epicsData?.epics ?? []
  const members = membersData?.members ?? []

  async function handleCreate() {
    if (!form.title.trim()) { toast.error('Título é obrigatório'); return }
    if (!form.epic_id || form.epic_id === NONE) { toast.error('Épico é obrigatório'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/pm/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:       form.title,
          description: form.description,
          status:      form.status,
          priority:    form.priority,
          type:        form.type,
          story_points: form.story_points ? parseInt(form.story_points) : null,
          due_date:    form.due_date || null,
          sprint_id:   form.sprint_id  === NONE ? null : form.sprint_id,
          phase_id:    form.phase_id   === NONE ? null : form.phase_id,
          epic_id:     form.epic_id    === NONE ? null : form.epic_id,
          assigned_to: form.assigned_to === NONE ? null : form.assigned_to,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      toast.success('Tarefa criada!')
      setForm({
        title: '', description: '', status: defaultStatus, priority: 'medium', type: 'task',
        story_points: '', due_date: '',
        sprint_id: NONE, phase_id: NONE, epic_id: defaultEpicId ?? NONE, assigned_to: NONE,
      })
      onCreated()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Tarefa</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="t-title">Título *</Label>
            <Input id="t-title" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Descreva a tarefa..."
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleCreate()}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="t-desc">Descrição</Label>
            <Textarea id="t-desc" rows={2} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Detalhes adicionais..."
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="task"          className="text-xs">Tarefa</SelectItem>
                  <SelectItem value="story"         className="text-xs">História</SelectItem>
                  <SelectItem value="bug"           className="text-xs">Bug / Defeito</SelectItem>
                  <SelectItem value="improvement"   className="text-xs">Melhoria</SelectItem>
                  <SelectItem value="risk"          className="text-xs">Risco</SelectItem>
                  <SelectItem value="deliverable"   className="text-xs">Entrega</SelectItem>
                  <SelectItem value="meeting"       className="text-xs">Reunião</SelectItem>
                  <SelectItem value="test"          className="text-xs">Teste</SelectItem>
                  <SelectItem value="document"      className="text-xs">Documento</SelectItem>
                  <SelectItem value="training"      className="text-xs">Treinamento</SelectItem>
                  <SelectItem value="configuration" className="text-xs">Configuração</SelectItem>
                  <SelectItem value="development"   className="text-xs">Desenvolvimento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Prioridade</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical" className="text-xs">🔴 Crítico</SelectItem>
                  <SelectItem value="high"     className="text-xs">🟠 Alto</SelectItem>
                  <SelectItem value="medium"   className="text-xs">🟡 Médio</SelectItem>
                  <SelectItem value="low"      className="text-xs">⚪ Baixo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="backlog"     className="text-xs">Backlog</SelectItem>
                  <SelectItem value="todo"        className="text-xs">A Fazer</SelectItem>
                  <SelectItem value="in_progress" className="text-xs">Em Andamento</SelectItem>
                  <SelectItem value="review"      className="text-xs">Em Revisão</SelectItem>
                  <SelectItem value="done"        className="text-xs">Concluído</SelectItem>
                  <SelectItem value="blocked"     className="text-xs">Bloqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Épico — obrigatório */}
          <div className="grid gap-1.5">
            <Label>Épico *</Label>
            <Select value={form.epic_id === NONE ? '' : form.epic_id} onValueChange={v => setForm(f => ({ ...f, epic_id: v }))}>
              <SelectTrigger className={cn('h-8 text-xs', (!form.epic_id || form.epic_id === NONE) && 'border-red-300')}>
                <SelectValue placeholder="Selecione o épico..." />
              </SelectTrigger>
              <SelectContent>
                {epics.map((e: { id: string; name: string; color: string }) => (
                  <SelectItem key={e.id} value={e.id} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: e.color }} />
                      {e.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {epics.length === 0 && (
              <p className="text-[10px] text-red-500">Crie épicos antes de criar tarefas.</p>
            )}
          </div>

          {/* Sprint, Phase */}
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label>Sprint</Label>
              <Select value={form.sprint_id} onValueChange={v => setForm(f => ({ ...f, sprint_id: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="— nenhum —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} className="text-xs text-muted-foreground">— nenhum —</SelectItem>
                  {sprints.map((s: { id: string; name: string }) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Fase</Label>
              <Select value={form.phase_id} onValueChange={v => setForm(f => ({ ...f, phase_id: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="— nenhuma —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} className="text-xs text-muted-foreground">— nenhuma —</SelectItem>
                  {phases.map((p: { id: string; name: string }) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assignee, Story Points, Due Date */}
          <div className="grid grid-cols-3 gap-2">
            <div className="grid gap-1.5">
              <Label>Responsável</Label>
              <Select value={form.assigned_to} onValueChange={v => setForm(f => ({ ...f, assigned_to: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="— nenhum —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} className="text-xs text-muted-foreground">— nenhum —</SelectItem>
                  {members.map((m: { user_id: string; full_name: string }) => (
                    <SelectItem key={m.user_id} value={m.user_id} className="text-xs">{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="t-sp">Story Points</Label>
              <Input id="t-sp" type="number" min={0} className="text-xs h-8"
                value={form.story_points}
                onChange={e => setForm(f => ({ ...f, story_points: e.target.value }))}
                placeholder="pts"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="t-due">Vencimento</Label>
              <Input id="t-due" type="date" className="text-xs h-8"
                value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Criar Tarefa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
