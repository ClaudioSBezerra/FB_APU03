import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Plus, Pencil, Trash2, Loader2, LayoutTemplate, ChevronDown, ChevronRight, GripVertical
} from 'lucide-react'

interface TemplatePhase {
  id: string
  template_id: string
  name: string
  description: string
  order_index: number
  color: string
}

interface Template {
  id: string
  name: string
  description: string
  active: boolean
  order_index: number
  phases: TemplatePhase[]
}

const COLORS = [
  { value: '#94a3b8', label: 'Cinza' },
  { value: '#6366f1', label: 'Índigo' },
  { value: '#3b82f6', label: 'Azul' },
  { value: '#22c55e', label: 'Verde' },
  { value: '#f59e0b', label: 'Amarelo' },
  { value: '#ec4899', label: 'Rosa' },
  { value: '#14b8a6', label: 'Teal' },
  { value: '#ef4444', label: 'Vermelho' },
]

const emptyTpl = { name: '', description: '', order_index: 0 }
const emptyPhase = { name: '', description: '', order_index: 0, color: '#6366f1' }

export default function TemplatesProjeto() {
  const { token } = useAuth()
  const qc = useQueryClient()

  // Template CRUD state
  const [tplDialog, setTplDialog] = useState<'create' | 'edit' | null>(null)
  const [selTpl, setSelTpl] = useState<Template | null>(null)
  const [tplForm, setTplForm] = useState(emptyTpl)
  const [savingTpl, setSavingTpl] = useState(false)

  // Phase CRUD state
  const [phaseDialog, setPhaseDialog] = useState<'create' | 'edit' | null>(null)
  const [selPhase, setSelPhase] = useState<TemplatePhase | null>(null)
  const [phaseForm, setPhaseForm] = useState(emptyPhase)
  const [phaseTemplateId, setPhaseTemplateId] = useState<string>('')
  const [savingPhase, setSavingPhase] = useState(false)

  // Expanded rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ['pm-templates-admin'],
    queryFn: async () => {
      const res = await fetch('/api/pm/project-templates/', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Erro ao carregar templates')
      return res.json()
    },
  })

  // ── Template handlers ─────────────────────────────────────────────────────
  function openCreateTpl() {
    setTplForm(emptyTpl)
    setSelTpl(null)
    setTplDialog('create')
  }

  function openEditTpl(t: Template) {
    setTplForm({ name: t.name, description: t.description, order_index: t.order_index })
    setSelTpl(t)
    setTplDialog('edit')
  }

  async function handleSaveTpl() {
    if (!tplForm.name.trim()) { toast.error('Nome é obrigatório'); return }
    setSavingTpl(true)
    try {
      const url    = tplDialog === 'edit' ? `/api/pm/project-templates/${selTpl!.id}` : '/api/pm/project-templates/'
      const method = tplDialog === 'edit' ? 'PUT' : 'POST'
      const body   = tplDialog === 'edit'
        ? { ...tplForm, active: selTpl!.active }
        : tplForm
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      toast.success(tplDialog === 'edit' ? 'Template atualizado!' : 'Template criado!')
      qc.invalidateQueries({ queryKey: ['pm-templates-admin'] })
      qc.invalidateQueries({ queryKey: ['pm-project-templates'] })
      setTplDialog(null)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSavingTpl(false)
    }
  }

  async function handleToggleTpl(t: Template) {
    try {
      const res = await fetch(`/api/pm/project-templates/${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: t.name, description: t.description, order_index: t.order_index, active: !t.active }),
      })
      if (!res.ok) throw new Error()
      toast.success(t.active ? 'Template desativado' : 'Template ativado')
      qc.invalidateQueries({ queryKey: ['pm-templates-admin'] })
      qc.invalidateQueries({ queryKey: ['pm-project-templates'] })
    } catch {
      toast.error('Erro ao alterar status')
    }
  }

  async function handleDeleteTpl(t: Template) {
    if (!confirm(`Excluir o template "${t.name}"? As fases serão removidas.`)) return
    try {
      const res = await fetch(`/api/pm/project-templates/${t.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      toast.success('Template excluído')
      qc.invalidateQueries({ queryKey: ['pm-templates-admin'] })
      qc.invalidateQueries({ queryKey: ['pm-project-templates'] })
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  // ── Phase handlers ────────────────────────────────────────────────────────
  function openCreatePhase(templateId: string) {
    setPhaseForm({ ...emptyPhase, order_index: 0 })
    setSelPhase(null)
    setPhaseTemplateId(templateId)
    setPhaseDialog('create')
  }

  function openEditPhase(p: TemplatePhase) {
    setPhaseForm({ name: p.name, description: p.description, order_index: p.order_index, color: p.color })
    setSelPhase(p)
    setPhaseDialog('edit')
  }

  async function handleSavePhase() {
    if (!phaseForm.name.trim()) { toast.error('Nome é obrigatório'); return }
    setSavingPhase(true)
    try {
      const url    = phaseDialog === 'edit'
        ? `/api/pm/template-phases/${selPhase!.id}`
        : `/api/pm/project-templates/${phaseTemplateId}/phases`
      const method = phaseDialog === 'edit' ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(phaseForm),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      toast.success(phaseDialog === 'edit' ? 'Fase atualizada!' : 'Fase criada!')
      qc.invalidateQueries({ queryKey: ['pm-templates-admin'] })
      setPhaseDialog(null)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSavingPhase(false)
    }
  }

  async function handleDeletePhase(p: TemplatePhase) {
    if (!confirm(`Excluir a fase "${p.name}"?`)) return
    try {
      const res = await fetch(`/api/pm/template-phases/${p.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      toast.success('Fase excluída')
      qc.invalidateQueries({ queryKey: ['pm-templates-admin'] })
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-primary" />
            Templates de Projeto
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Defina estruturas de fases reutilizáveis para novos projetos
          </p>
        </div>
        <Button size="sm" onClick={openCreateTpl}>
          <Plus className="h-4 w-4 mr-1" /> Novo Template
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {templates.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhum template criado.
            </div>
          )}
          {templates.map(t => (
            <div key={t.id}>
              {/* Template row */}
              <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30">
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => toggleExpand(t.id)}
                >
                  {expanded.has(t.id)
                    ? <ChevronDown className="h-4 w-4" />
                    : <ChevronRight className="h-4 w-4" />}
                </button>
                <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t.name}</p>
                  {t.description && (
                    <p className="text-xs text-muted-foreground truncate">{t.description}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {t.phases.length} fase{t.phases.length !== 1 ? 's' : ''}
                </span>
                <button onClick={() => handleToggleTpl(t)}>
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1.5 py-0 h-4 cursor-pointer ${
                      t.active
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}
                  >
                    {t.active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditTpl(t)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon"
                  className="h-6 w-6 text-red-500 hover:text-red-600"
                  onClick={() => handleDeleteTpl(t)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Fases expandidas */}
              {expanded.has(t.id) && (
                <div className="bg-muted/20 px-4 py-2 space-y-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Fases do Template
                    </span>
                    <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => openCreatePhase(t.id)}>
                      <Plus className="h-3 w-3 mr-1" /> Adicionar Fase
                    </Button>
                  </div>
                  {t.phases.length === 0 && (
                    <p className="text-xs text-muted-foreground italic py-2">
                      Nenhuma fase definida.
                    </p>
                  )}
                  {t.phases.map(p => (
                    <div key={p.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/40">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="text-xs font-medium flex-1">{p.name}</span>
                      {p.description && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                          {p.description}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground w-6 text-right">{p.order_index}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => openEditPhase(p)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-5 w-5 text-red-500 hover:text-red-600"
                        onClick={() => handleDeletePhase(p)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dialog Template */}
      <Dialog open={!!tplDialog} onOpenChange={o => { if (!o) setTplDialog(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tplDialog === 'edit' ? 'Editar Template' : 'Novo Template'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Nome *</Label>
              <Input
                value={tplForm.name}
                onChange={e => setTplForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Implementação SAP"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                value={tplForm.description}
                onChange={e => setTplForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descreva quando usar este template..."
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Ordem de exibição</Label>
              <Input
                type="number" min={0} className="w-24"
                value={tplForm.order_index}
                onChange={e => setTplForm(f => ({ ...f, order_index: parseInt(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTplDialog(null)}>Cancelar</Button>
            <Button onClick={handleSaveTpl} disabled={savingTpl}>
              {savingTpl ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {tplDialog === 'edit' ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Fase */}
      <Dialog open={!!phaseDialog} onOpenChange={o => { if (!o) setPhaseDialog(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{phaseDialog === 'edit' ? 'Editar Fase' : 'Nova Fase'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Nome *</Label>
              <Input
                value={phaseForm.name}
                onChange={e => setPhaseForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Backlog"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Descrição</Label>
              <Input
                value={phaseForm.description}
                onChange={e => setPhaseForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Opcional..."
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Ordem</Label>
              <Input
                type="number" min={0} className="w-24"
                value={phaseForm.order_index}
                onChange={e => setPhaseForm(f => ({ ...f, order_index: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Cor</Label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                      phaseForm.color === c.value ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setPhaseForm(f => ({ ...f, color: c.value }))}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhaseDialog(null)}>Cancelar</Button>
            <Button onClick={handleSavePhase} disabled={savingPhase}>
              {savingPhase ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {phaseDialog === 'edit' ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
