import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Plus, Kanban, Users, CheckSquare, Calendar, ChevronRight,
  FolderKanban, Loader2, Crown, User
} from 'lucide-react'

interface Project {
  id: string
  name: string
  description: string
  status: string
  type: string
  start_date: string | null
  end_date: string | null
  created_at: string
  owner_id: string | null
  pm_id: string | null
  owner_name: string | null
  pm_name: string | null
  member_count: number
  task_count: number
  done_count: number
}

interface UserOption {
  id: string
  full_name: string
  email: string
  pm_role: string
}

interface ProjectType {
  id: string
  name: string
  code: string
}

interface TemplatePhase {
  id: string
  name: string
  color: string
  order_index: number
}

interface Template {
  id: string
  name: string
  description: string
  phases: TemplatePhase[]
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  planning:  { label: 'Planejamento', color: 'bg-blue-100 text-blue-700' },
  active:    { label: 'Ativo',        color: 'bg-green-100 text-green-700' },
  on_hold:   { label: 'Pausado',      color: 'bg-yellow-100 text-yellow-700' },
  completed: { label: 'Concluído',    color: 'bg-gray-100 text-gray-600' },
  cancelled: { label: 'Cancelado',    color: 'bg-red-100 text-red-700' },
}

// ── Typeahead de usuários ────────────────────────────────────────────────────
function UserPicker({
  label, value, onChange, token,
}: {
  label: string
  value: UserOption | null
  onChange: (u: UserOption | null) => void
  token: string | null
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<UserOption[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (!token) return
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pm/users?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) setResults(await res.json())
      } catch { /* ignore */ }
    }, 200)
    return () => clearTimeout(t)
  }, [q, token])

  return (
    <div className="grid gap-1.5" ref={ref}>
      <Label className="text-xs">{label}</Label>
      {value ? (
        <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md bg-muted/40 text-sm">
          <span className="flex-1 text-xs font-medium">{value.full_name}</span>
          <span className="text-[10px] text-muted-foreground">{value.email}</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xs ml-1"
            onClick={() => { onChange(null); setQ('') }}
          >✕</button>
        </div>
      ) : (
        <div className="relative">
          <Input
            className="h-8 text-xs"
            placeholder="Buscar por nome ou e-mail..."
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
          />
          {open && results.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-md max-h-48 overflow-auto">
              {results.map(u => (
                <button
                  key={u.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2"
                  onClick={() => { onChange(u); setOpen(false); setQ('') }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{u.full_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                  </div>
                  {u.pm_role && (
                    <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0">
                      {u.pm_role}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ProjectList() {
  const { token, companyId } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', description: '', status: 'planning', type: 'sap_implementation',
    start_date: '', end_date: '',
  })
  const [ownerUser, setOwnerUser]   = useState<UserOption | null>(null)
  const [pmUser, setPmUser]         = useState<UserOption | null>(null)
  const [templateId, setTemplateId] = useState<string>('__none__')

  const { data, isLoading } = useQuery({
    queryKey: ['pm-projects'],
    queryFn: async () => {
      const res = await fetch('/api/pm/projects', {
        headers: { Authorization: `Bearer ${token}`, 'X-Company-ID': companyId ?? '' },
      })
      if (!res.ok) throw new Error('Erro ao carregar projetos')
      return res.json()
    },
  })

  const { data: typesData } = useQuery<ProjectType[]>({
    queryKey: ['pm-project-types'],
    queryFn: async () => {
      const res = await fetch('/api/pm/project-types', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: templatesData = [] } = useQuery<Template[]>({
    queryKey: ['pm-project-templates'],
    queryFn: async () => {
      const res = await fetch('/api/pm/project-templates', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return []
      return res.json()
    },
  })

  const typeLabel = (code: string) =>
    typesData?.find(t => t.code === code)?.name ?? code

  async function handleCreate() {
    if (!form.name.trim()) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/pm/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Company-ID': companyId ?? '',
        },
        body: JSON.stringify({
          ...form,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          owner_id: ownerUser?.id ?? null,
          pm_id: pmUser?.id ?? null,
          template_id: templateId === '__none__' ? null : templateId,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast.success('Projeto criado!')
      qc.invalidateQueries({ queryKey: ['pm-projects'] })
      setOpen(false)
      setForm({ name: '', description: '', status: 'planning', type: 'sap_implementation', start_date: '', end_date: '' })
      setOwnerUser(null)
      setPmUser(null)
      setTemplateId('__none__')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar')
    } finally {
      setSaving(false)
    }
  }

  const projects: Project[] = data?.projects ?? []

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-primary" />
            Gestão de Projetos
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Projetos de implementações sistêmicas e consultoria
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo Projeto
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <Kanban className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Nenhum projeto criado ainda.</p>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Criar primeiro projeto
          </Button>
        </div>
      )}

      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map(p => {
          const progress = p.task_count > 0
            ? Math.round((p.done_count / p.task_count) * 100) : 0
          const st = STATUS_LABELS[p.status] ?? { label: p.status, color: 'bg-gray-100 text-gray-600' }
          return (
            <Card
              key={p.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/pm/${p.id}/kanban`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold leading-tight line-clamp-2">
                    {p.name}
                  </CardTitle>
                  <Badge className={`shrink-0 text-[10px] px-1.5 py-0 ${st.color}`} variant="outline">
                    {st.label}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {typeLabel(p.type)}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {p.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                )}

                {/* Owner / PM */}
                {(p.owner_name || p.pm_name) && (
                  <div className="flex flex-col gap-0.5">
                    {p.owner_name && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Crown className="h-3 w-3 text-yellow-500" />
                        <span className="font-medium">Sponsor:</span> {p.owner_name}
                      </span>
                    )}
                    {p.pm_name && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <User className="h-3 w-3 text-primary" />
                        <span className="font-medium">PM:</span> {p.pm_name}
                      </span>
                    )}
                  </div>
                )}

                {/* Progress */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{p.done_count}/{p.task_count} tarefas</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>

                {/* Meta */}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" /> {p.member_count} membros
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckSquare className="h-3 w-3" /> {p.task_count} tarefas
                  </span>
                  {p.end_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(p.end_date).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-end text-[10px] text-primary font-medium">
                  Abrir <ChevronRight className="h-3 w-3 ml-0.5" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Dialog Criar Projeto */}
      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) { setOwnerUser(null); setPmUser(null); setTemplateId('__none__') } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Projeto</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="p-name">Nome *</Label>
              <Input id="p-name" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Implantação SAP S/4HANA — Filial SP"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-desc">Descrição</Label>
              <Textarea id="p-desc" rows={2} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Objetivo e contexto do projeto..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(typesData ?? []).map(t => (
                      <SelectItem key={t.code} value={t.code} className="text-xs">{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Template */}
            {templatesData.length > 0 && (
              <div className="grid gap-1.5">
                <Label>Template de Fases</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sem template (fases manuais)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="text-xs">Sem template (fases manuais)</SelectItem>
                    {templatesData.map(t => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {templateId !== '__none__' && (() => {
                  const tpl = templatesData.find(t => t.id === templateId)
                  if (!tpl || tpl.phases.length === 0) return null
                  return (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tpl.phases.map(p => (
                        <span
                          key={p.id}
                          className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border"
                          style={{ borderColor: p.color, color: p.color, backgroundColor: p.color + '18' }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                          {p.name}
                        </span>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Dono e PM */}
            <div className="border rounded-md p-3 bg-muted/20 space-y-3">
              <p className="text-xs font-semibold text-foreground">Responsáveis</p>
              <UserPicker
                label="🏆 Dono do Projeto (Sponsor)"
                value={ownerUser}
                onChange={setOwnerUser}
                token={token}
              />
              <UserPicker
                label="🎯 Gerente de Projetos (PM)"
                value={pmUser}
                onChange={setPmUser}
                token={token}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="p-start">Início</Label>
                <Input id="p-start" type="date" className="text-xs"
                  value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-end">Término</Label>
                <Input id="p-end" type="date" className="text-xs"
                  value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Criar Projeto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
