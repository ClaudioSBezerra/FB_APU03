import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { ProjectNav } from '@/components/pm/ProjectNav'

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  sponsor:    { label: 'Sponsor', color: 'bg-yellow-100 text-yellow-700' },
  pm:         { label: 'Gerente de Projeto', color: 'bg-blue-100 text-blue-700' },
  consultant: { label: 'Consultor', color: 'bg-purple-100 text-purple-700' },
  developer:  { label: 'Desenvolvedor', color: 'bg-indigo-100 text-indigo-700' },
  key_user:   { label: 'Key User', color: 'bg-green-100 text-green-700' },
  functional: { label: 'Funcional', color: 'bg-orange-100 text-orange-700' },
}

interface Member {
  id: string
  user_id: string
  full_name: string
  email: string
  role: string
  joined_at: string
}

export default function ProjectMembers() {
  const { id: projectId } = useParams<{ id: string }>()
  const { token, companyId } = useAuth()
  const qc = useQueryClient()
  const authHeaders = { Authorization: `Bearer ${token}`, 'X-Company-ID': companyId ?? '' }

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ user_id: '', role: 'developer' })
  const [userSearch, setUserSearch] = useState('')

  const { data: project } = useQuery({
    queryKey: ['pm-project', projectId],
    queryFn: async () => (await fetch(`/api/pm/projects/${projectId}`, { headers: authHeaders })).json(),
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pm-members', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/pm/projects/${projectId}/members`, { headers: authHeaders })
      return res.json()
    },
    enabled: !!projectId,
  })

  const { data: usersData } = useQuery({
    queryKey: ['company-users'],
    queryFn: async () => {
      const res = await fetch('/api/admin/users', { headers: authHeaders })
      if (!res.ok) return { users: [] }
      return res.json()
    },
  })

  const members: Member[] = data?.members ?? []
  const allUsers = usersData?.users ?? []
  const filteredUsers = allUsers.filter((u: { id: string; full_name: string; email: string }) =>
    !userSearch ||
    u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  )

  async function addMember() {
    if (!form.user_id) { toast.error('Selecione um usuário'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/pm/projects/${projectId}/members`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      toast.success('Membro adicionado!')
      qc.invalidateQueries({ queryKey: ['pm-members', projectId] })
      setOpen(false)
      setForm({ user_id: '', role: 'developer' })
      setUserSearch('')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  async function removeMember(userId: string, name: string) {
    if (!confirm(`Remover ${name} do projeto?`)) return
    await fetch(`/api/pm/projects/${projectId}/members/${userId}`, {
      method: 'DELETE', headers: authHeaders,
    })
    toast.success('Membro removido')
    refetch()
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <ProjectNav projectId={projectId!} projectName={project?.name} />
      <div className="flex justify-end">
        <Button size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar Membro
        </Button>
      </div>

      {/* Members list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          {members.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <p className="text-sm text-muted-foreground">Nenhum membro ainda.</p>
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Membro</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Papel</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Desde</th>
                  <th className="px-4 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody>
                {members.map(m => {
                  const role = ROLE_LABELS[m.role] ?? { label: m.role, color: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={m.id} className="border-b last:border-b-0 hover:bg-muted/10">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                            {m.full_name?.charAt(0).toUpperCase() ?? '?'}
                          </div>
                          <div>
                            <p className="font-medium">{m.full_name}</p>
                            <p className="text-muted-foreground text-[10px]">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] px-2 py-0.5 ${role.color}`} variant="outline">
                          {role.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                        {new Date(m.joined_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="text-muted-foreground hover:text-red-500 transition-colors"
                          onClick={() => removeMember(m.user_id, m.full_name)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Add member dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar Membro</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label>Buscar usuário</Label>
              <Input
                placeholder="Nome ou e-mail..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="text-xs"
              />
              {userSearch && filteredUsers.length > 0 && (
                <div className="border rounded-md bg-white shadow-sm max-h-40 overflow-y-auto">
                  {filteredUsers.slice(0, 8).map((u: { id: string; full_name: string; email: string }) => (
                    <button
                      key={u.id}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
                      onClick={() => { setForm(f => ({ ...f, user_id: u.id })); setUserSearch(u.full_name) }}
                    >
                      <span className="font-medium">{u.full_name}</span>
                      <span className="text-muted-foreground ml-2">{u.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>Papel no Projeto</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={addMember} disabled={saving || !form.user_id}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
