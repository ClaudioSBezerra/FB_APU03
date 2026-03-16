import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Loader2, ArrowUp, ArrowDown } from 'lucide-react'
import { ProjectNav } from '@/components/pm/ProjectNav'

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

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  open:       { label: 'Aberto',      color: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_progress:{ label: 'Em andamento',color: 'bg-orange-50 text-orange-700 border-orange-200' },
  done:       { label: 'Concluído',   color: 'bg-green-50 text-green-700 border-green-200' },
  cancelled:  { label: 'Cancelado',   color: 'bg-gray-50 text-gray-500 border-gray-200' },
}

const COLORS = [
  { value: '#6366f1', label: 'Índigo' },
  { value: '#3b82f6', label: 'Azul' },
  { value: '#10b981', label: 'Verde' },
  { value: '#f59e0b', label: 'Âmbar' },
  { value: '#ef4444', label: 'Vermelho' },
  { value: '#8b5cf6', label: 'Roxo' },
  { value: '#06b6d4', label: 'Ciano' },
  { value: '#f97316', label: 'Laranja' },
]

const emptyForm = {
  name: '', description: '', color: '#6366f1',
  status: 'open', start_date: '', end_date: '', order_index: 0,
}

export default function ProjectEpics() {
  const { id: projectId } = useParams<{ id: string }>()
  const { token, companyId } = useAuth()
  const qc = useQueryClient()
  const headers = { Authorization: `Bearer ${token}`, 'X-Company-ID': companyId ?? '' }

  const [dialog, setDialog]     = useState<'create' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Epic | null>(null)
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)

  const { data: projectData } = useQuery({
    queryKey: ['pm-project', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/pm/projects/${projectId}`, { headers })
      if (!res.ok) throw new Error('Erro')
      return res.json()
    },
    enabled: !!projectId,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['pm-epics', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/pm/projects/${projectId}/epics`, { headers })
      if (!res.ok) throw new Error('Erro ao carregar épicos')
      return res.json()
    },
    enabled: !!projectId,
  })

  const epics: Epic[] = (data?.epics ?? []).sort(
    (a: Epic, b: Epic) => a.order_index - b.order_index
  )

  function openCreate() {
    setForm({ ...emptyForm, order_index: epics.length })
    setSelected(null)
    setDialog('create')
  }

  function openEdit(e: Epic) {
    setForm({
      name: e.name,
      description: e.description ?? '',
      color: e.color ?? '#6366f1',
      status: e.status,
      start_date: e.start_date ?? '',
      end_date: e.end_date ?? '',
      order_index: e.order_index,
    })
    setSelected(e)
    setDialog('edit')
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    try {
      const url    = dialog === 'edit'
        ? `/api/pm/projects/${projectId}/epics/${selected!.id}`
        : `/api/pm/projects/${projectId}/epics`
      const method = dialog === 'edit' ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      toast.success(dialog === 'edit' ? 'Épico atualizado!' : 'Épico criado!')
      qc.invalidateQueries({ queryKey: ['pm-epics', projectId] })
      setDialog(null)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function reorder(epic: Epic, dir: 'up' | 'down') {
    const idx   = epics.findIndex(e => e.id === epic.id)
    const other = epics[dir === 'up' ? idx - 1 : idx + 1]
    if (!other) return
    await Promise.all([
      fetch(`/api/pm/projects/${projectId}/epics/${epic.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_index: other.order_index }),
      }),
      fetch(`/api/pm/projects/${projectId}/epics/${other.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_index: epic.order_index }),
      }),
    ])
    qc.invalidateQueries({ queryKey: ['pm-epics', projectId] })
  }

  async function handleDelete(e: Epic) {
    if (!confirm(`Excluir épico "${e.name}"?`)) return
    try {
      const res = await fetch(`/api/pm/projects/${projectId}/epics/${e.id}`, {
        method: 'DELETE', headers,
      })
      if (!res.ok) throw new Error()
      toast.success('Épico excluído')
      qc.invalidateQueries({ queryKey: ['pm-epics', projectId] })
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  return (
    <div className="flex flex-col">
      <ProjectNav projectId={projectId!} projectName={projectData?.name} />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Épicos do Projeto</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Agrupe tarefas por iniciativas ou funcionalidades maiores
            </p>
          </div>
          <Button size="sm" className="h-7 text-xs" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Novo Épico
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : epics.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
            <p className="text-sm">Nenhum épico criado ainda.</p>
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Criar primeiro épico
            </Button>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="h-8">
                  <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3 w-16">Ordem</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3">Épico</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3">Descrição</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3">Período</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3">Status</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3">Tarefas</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {epics.map((e, idx) => {
                  const cfg = STATUS_CFG[e.status] ?? { label: e.status, color: '' }
                  const done = e.done_count ?? 0
                  const total = e.task_count ?? 0
                  return (
                    <TableRow key={e.id} className="h-9">
                      <TableCell className="py-1.5 px-3">
                        <div className="flex items-center gap-1">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: e.color }}
                          />
                          <span className="text-xs text-muted-foreground">{e.order_index + 1}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-medium py-1.5 px-3 whitespace-nowrap">
                        {e.name}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-1.5 px-3 max-w-[200px] truncate">
                        {e.description || <span className="italic">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-1.5 px-3 whitespace-nowrap">
                        {e.start_date
                          ? `${new Date(e.start_date).toLocaleDateString('pt-BR')} → ${e.end_date ? new Date(e.end_date).toLocaleDateString('pt-BR') : '?'}`
                          : <span className="italic">—</span>}
                      </TableCell>
                      <TableCell className="py-1.5 px-3">
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${cfg.color}`}>
                          {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5 px-3">
                        {total > 0 ? (
                          <span className="text-xs text-muted-foreground">{done}/{total}</span>
                        ) : (
                          <span className="text-xs italic text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === 0}
                          onClick={() => reorder(e, 'up')}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === epics.length - 1}
                          onClick={() => reorder(e, 'down')}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6"
                          onClick={() => openEdit(e)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500"
                          onClick={() => handleDelete(e)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={!!dialog} onOpenChange={o => { if (!o) setDialog(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog === 'edit' ? 'Editar Épico' : 'Novo Épico'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Módulo Financeiro"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Objetivo deste épico..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open"        className="text-xs">Aberto</SelectItem>
                    <SelectItem value="in_progress" className="text-xs">Em andamento</SelectItem>
                    <SelectItem value="done"        className="text-xs">Concluído</SelectItem>
                    <SelectItem value="cancelled"   className="text-xs">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Cor</Label>
                <Select value={form.color} onValueChange={v => setForm(f => ({ ...f, color: v }))}>
                  <SelectTrigger className="h-8 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: form.color }} />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {COLORS.map(c => (
                      <SelectItem key={c.value} value={c.value} className="text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ background: c.value }} />
                          {c.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Início</Label>
                <Input type="date" className="text-xs" value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Término</Label>
                <Input type="date" className="text-xs" value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {dialog === 'edit' ? 'Salvar' : 'Criar Épico'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
