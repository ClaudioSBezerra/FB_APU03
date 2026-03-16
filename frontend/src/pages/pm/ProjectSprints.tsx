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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Loader2, Play, CheckCircle2 } from 'lucide-react'
import { ProjectNav } from '@/components/pm/ProjectNav'

interface Sprint {
  id: string
  project_id: string
  name: string
  goal: string
  status: string
  start_date: string | null
  end_date: string | null
  created_at: string
  task_count?: number
  done_count?: number
}

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  planning:  { label: 'Planejamento', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  active:    { label: 'Ativo',        color: 'bg-green-50 text-green-700 border-green-200' },
  completed: { label: 'Concluído',    color: 'bg-gray-50 text-gray-600 border-gray-200' },
}

const emptyForm = { name: '', goal: '', start_date: '', end_date: '' }

export default function ProjectSprints() {
  const { id: projectId } = useParams<{ id: string }>()
  const { token, companyId } = useAuth()
  const qc = useQueryClient()
  const headers = { Authorization: `Bearer ${token}`, 'X-Company-ID': companyId ?? '' }

  const [dialog, setDialog]   = useState<'create' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Sprint | null>(null)
  const [form, setForm]       = useState(emptyForm)
  const [saving, setSaving]   = useState(false)

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
    queryKey: ['pm-sprints', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/pm/projects/${projectId}/sprints`, { headers })
      if (!res.ok) throw new Error('Erro ao carregar sprints')
      return res.json()
    },
    enabled: !!projectId,
  })

  const sprints: Sprint[] = data?.sprints ?? []

  function openCreate() {
    setForm(emptyForm)
    setSelected(null)
    setDialog('create')
  }

  function openEdit(s: Sprint) {
    setForm({
      name: s.name,
      goal: s.goal ?? '',
      start_date: s.start_date ?? '',
      end_date: s.end_date ?? '',
    })
    setSelected(s)
    setDialog('edit')
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    try {
      const url    = dialog === 'edit'
        ? `/api/pm/projects/${projectId}/sprints/${selected!.id}`
        : `/api/pm/projects/${projectId}/sprints`
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
      toast.success(dialog === 'edit' ? 'Sprint atualizado!' : 'Sprint criado!')
      qc.invalidateQueries({ queryKey: ['pm-sprints', projectId] })
      setDialog(null)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleStatus(s: Sprint, newStatus: string) {
    try {
      const res = await fetch(`/api/pm/projects/${projectId}/sprints/${s.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
      toast.success(newStatus === 'active' ? 'Sprint ativado!' : 'Sprint concluído!')
      qc.invalidateQueries({ queryKey: ['pm-sprints', projectId] })
    } catch {
      toast.error('Erro ao atualizar sprint')
    }
  }

  async function handleDelete(s: Sprint) {
    if (!confirm(`Excluir sprint "${s.name}"?`)) return
    try {
      const res = await fetch(`/api/pm/projects/${projectId}/sprints/${s.id}`, {
        method: 'DELETE', headers,
      })
      if (!res.ok) throw new Error()
      toast.success('Sprint excluído')
      qc.invalidateQueries({ queryKey: ['pm-sprints', projectId] })
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  const hasActive = sprints.some(s => s.status === 'active')

  return (
    <div className="flex flex-col">
      <ProjectNav projectId={projectId!} projectName={projectData?.name} />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Sprints</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gerencie os ciclos de desenvolvimento do projeto
            </p>
          </div>
          <Button size="sm" className="h-7 text-xs" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Novo Sprint
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sprints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
            <p className="text-sm">Nenhum sprint criado ainda.</p>
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Criar primeiro sprint
            </Button>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="h-8">
                  <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3">Sprint</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3">Objetivo</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3">Período</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3">Status</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sprints.map(s => {
                  const cfg = STATUS_CFG[s.status] ?? { label: s.status, color: '' }
                  return (
                    <TableRow key={s.id} className="h-9">
                      <TableCell className="text-xs font-medium py-1.5 px-3 whitespace-nowrap">
                        {s.name}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-1.5 px-3 max-w-[220px] truncate">
                        {s.goal || <span className="italic">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-1.5 px-3 whitespace-nowrap">
                        {s.start_date
                          ? `${new Date(s.start_date).toLocaleDateString('pt-BR')} → ${s.end_date ? new Date(s.end_date).toLocaleDateString('pt-BR') : '?'}`
                          : <span className="italic">—</span>}
                      </TableCell>
                      <TableCell className="py-1.5 px-3">
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${cfg.color}`}>
                          {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-right whitespace-nowrap">
                        {s.status === 'planning' && !hasActive && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-green-600"
                            title="Ativar sprint" onClick={() => handleStatus(s, 'active')}>
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {s.status === 'active' && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-blue-600"
                            title="Concluir sprint" onClick={() => handleStatus(s, 'completed')}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {s.status !== 'completed' && (
                          <Button variant="ghost" size="icon" className="h-6 w-6"
                            title="Editar" onClick={() => openEdit(s)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500"
                          title="Excluir" onClick={() => handleDelete(s)}>
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
            <DialogTitle>{dialog === 'edit' ? 'Editar Sprint' : 'Novo Sprint'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Sprint 1 — Setup"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Objetivo</Label>
              <Textarea
                rows={2}
                value={form.goal}
                onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
                placeholder="Meta principal deste sprint..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Início</Label>
                <Input type="date" className="text-xs"
                  value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Término</Label>
                <Input type="date" className="text-xs"
                  value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {dialog === 'edit' ? 'Salvar' : 'Criar Sprint'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
