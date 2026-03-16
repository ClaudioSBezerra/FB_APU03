import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Loader2, Tags } from 'lucide-react'

interface ProjectType {
  id: string
  name: string
  code: string
  description: string
  active: boolean
  order_index: number
}

const emptyForm = { name: '', code: '', description: '', order_index: 0 }

export default function TiposProjeto() {
  const { token } = useAuth()
  const qc = useQueryClient()
  const [dialog, setDialog]   = useState<'create' | 'edit' | null>(null)
  const [selected, setSelected] = useState<ProjectType | null>(null)
  const [form, setForm]       = useState(emptyForm)
  const [saving, setSaving]   = useState(false)

  const { data: types = [], isLoading } = useQuery<ProjectType[]>({
    queryKey: ['pm-project-types-admin'],
    queryFn: async () => {
      const res = await fetch('/api/pm/project-types/all', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Erro ao carregar tipos')
      return res.json()
    },
  })

  function openCreate() {
    setForm(emptyForm)
    setSelected(null)
    setDialog('create')
  }

  function openEdit(t: ProjectType) {
    setForm({ name: t.name, code: t.code, description: t.description, order_index: t.order_index })
    setSelected(t)
    setDialog('edit')
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Nome é obrigatório'); return }
    if (!form.code.trim()) { toast.error('Código é obrigatório'); return }
    setSaving(true)
    try {
      const url    = dialog === 'edit' ? `/api/pm/project-types/${selected!.id}` : '/api/pm/project-types'
      const method = dialog === 'edit' ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      toast.success(dialog === 'edit' ? 'Tipo atualizado!' : 'Tipo criado!')
      qc.invalidateQueries({ queryKey: ['pm-project-types-admin'] })
      qc.invalidateQueries({ queryKey: ['pm-project-types'] })
      setDialog(null)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(t: ProjectType) {
    try {
      const res = await fetch(`/api/pm/project-types/${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...t, active: !t.active }),
      })
      if (!res.ok) throw new Error()
      toast.success(t.active ? 'Tipo desativado' : 'Tipo ativado')
      qc.invalidateQueries({ queryKey: ['pm-project-types-admin'] })
      qc.invalidateQueries({ queryKey: ['pm-project-types'] })
    } catch {
      toast.error('Erro ao alterar status')
    }
  }

  async function handleDelete(t: ProjectType) {
    if (!confirm(`Excluir o tipo "${t.name}"? Projetos existentes manterão o código.`)) return
    try {
      const res = await fetch(`/api/pm/project-types/${t.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      toast.success('Tipo excluído')
      qc.invalidateQueries({ queryKey: ['pm-project-types-admin'] })
      qc.invalidateQueries({ queryKey: ['pm-project-types'] })
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Tags className="h-5 w-5 text-primary" />
            Tipos de Projeto
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gerencie os tipos disponíveis para classificação de projetos
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Novo Tipo
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="h-8">
                <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3">Ordem</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3">Nome</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3">Código</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3">Descrição</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3">Status</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide py-1.5 px-3 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map(t => (
                <TableRow key={t.id} className="h-8">
                  <TableCell className="text-xs py-1 px-3 text-muted-foreground">{t.order_index}</TableCell>
                  <TableCell className="text-xs font-medium py-1 px-3">{t.name}</TableCell>
                  <TableCell className="py-1 px-3">
                    <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{t.code}</code>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground py-1 px-3 max-w-[200px] truncate">
                    {t.description || <span className="italic">—</span>}
                  </TableCell>
                  <TableCell className="py-1 px-3">
                    <button onClick={() => handleToggle(t)}>
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
                  </TableCell>
                  <TableCell className="py-1 px-3 text-right">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 text-red-500 hover:text-red-600"
                      onClick={() => handleDelete(t)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={o => { if (!o) setDialog(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog === 'edit' ? 'Editar Tipo' : 'Novo Tipo de Projeto'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Implementação SAP"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>
                Código *
                <span className="text-[10px] text-muted-foreground ml-1">(identificador único, sem espaços)</span>
              </Label>
              <Input
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                placeholder="Ex: sap_implementation"
                disabled={dialog === 'edit'}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descrição opcional..."
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Ordem de exibição</Label>
              <Input
                type="number" min={0} className="w-24"
                value={form.order_index}
                onChange={e => setForm(f => ({ ...f, order_index: parseInt(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {dialog === 'edit' ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
