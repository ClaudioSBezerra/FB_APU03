import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
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

interface Props {
  projectId: string
  defaultStatus?: string
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function CreateTaskDialog({ projectId, defaultStatus = 'backlog', open, onClose, onCreated }: Props) {
  const { token, companyId } = useAuth()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '', description: '', status: defaultStatus,
    priority: 'medium', type: 'task',
    story_points: '', due_date: '',
  })

  async function handleCreate() {
    if (!form.title.trim()) { toast.error('Título é obrigatório'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/pm/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Company-ID': companyId ?? '',
        },
        body: JSON.stringify({
          ...form,
          story_points: form.story_points ? parseInt(form.story_points) : null,
          due_date: form.due_date || null,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      toast.success('Tarefa criada!')
      setForm({ title: '', description: '', status: defaultStatus, priority: 'medium', type: 'task', story_points: '', due_date: '' })
      onCreated()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
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
                  <SelectItem value="task"        className="text-xs">Tarefa</SelectItem>
                  <SelectItem value="story"       className="text-xs">História</SelectItem>
                  <SelectItem value="bug"         className="text-xs">Bug</SelectItem>
                  <SelectItem value="improvement" className="text-xs">Melhoria</SelectItem>
                  <SelectItem value="risk"        className="text-xs">Risco</SelectItem>
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
          <div className="grid grid-cols-2 gap-2">
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
