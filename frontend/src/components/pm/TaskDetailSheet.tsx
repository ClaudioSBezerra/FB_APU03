import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Save, Loader2, MessageSquare, Paperclip, Mic, Trash2, Send, Upload
} from 'lucide-react'
import { type Task } from '@/pages/pm/ProjectKanban'
import { AudioNoteRecorder } from './AudioNoteRecorder'
import { useAuth as useAuthContext } from '@/contexts/AuthContext'

interface Props {
  task: Task
  open: boolean
  onClose: () => void
  onUpdated: () => void
}

const STATUS_OPTIONS = [
  { value: 'backlog',     label: 'Backlog' },
  { value: 'todo',        label: 'A Fazer' },
  { value: 'in_progress', label: 'Em Andamento' },
  { value: 'review',      label: 'Em Revisão' },
  { value: 'done',        label: 'Concluído' },
  { value: 'blocked',     label: 'Bloqueado' },
]

const PRIORITY_OPTIONS = [
  { value: 'critical', label: '🔴 Crítico' },
  { value: 'high',     label: '🟠 Alto' },
  { value: 'medium',   label: '🟡 Médio' },
  { value: 'low',      label: '⚪ Baixo' },
]

interface Comment {
  id: string
  user_name: string
  content: string
  created_at: string
}

interface Attachment {
  id: string
  filename: string
  file_url: string
  file_size: number
  mime_type: string
  user_name: string
  created_at: string
}

export function TaskDetailSheet({ task, open, onClose, onUpdated }: Props) {
  const { token, companyId } = useAuth()
  const { user } = useAuthContext()
  const authHeaders = { Authorization: `Bearer ${token}`, 'X-Company-ID': companyId ?? '' }

  const [form, setForm] = useState({
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    type: task.type,
    story_points: task.story_points?.toString() ?? '',
    due_date: task.due_date ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [attachmentsLoaded, setAttachmentsLoaded] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/pm/tasks/${task.id}`, {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          story_points: form.story_points ? parseInt(form.story_points) : null,
          due_date: form.due_date || null,
        }),
      })
      if (!res.ok) throw new Error('Erro ao salvar')
      toast.success('Tarefa salva!')
      onUpdated()
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function deleteTask() {
    if (!confirm('Excluir esta tarefa permanentemente?')) return
    await fetch(`/api/pm/tasks/${task.id}`, { method: 'DELETE', headers: authHeaders })
    toast.success('Tarefa excluída')
    onUpdated()
  }

  async function loadComments() {
    if (commentsLoaded) return
    const res = await fetch(`/api/pm/tasks/${task.id}/comments`, { headers: authHeaders })
    if (res.ok) {
      const d = await res.json()
      setComments(d.comments ?? [])
    }
    setCommentsLoaded(true)
  }

  async function sendComment() {
    if (!newComment.trim()) return
    setSendingComment(true)
    try {
      const res = await fetch(`/api/pm/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment }),
      })
      if (!res.ok) throw new Error('Erro')
      setNewComment('')
      // reload comments
      const r2 = await fetch(`/api/pm/tasks/${task.id}/comments`, { headers: authHeaders })
      if (r2.ok) { const d = await r2.json(); setComments(d.comments ?? []) }
    } catch {
      toast.error('Erro ao enviar comentário')
    } finally {
      setSendingComment(false)
    }
  }

  async function loadAttachments() {
    if (attachmentsLoaded) return
    const res = await fetch(`/api/pm/tasks/${task.id}/attachments`, { headers: authHeaders })
    if (res.ok) {
      const d = await res.json()
      setAttachments(d.attachments ?? [])
    }
    setAttachmentsLoaded(true)
  }

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/pm/tasks/${task.id}/attachments`, {
        method: 'POST',
        headers: authHeaders,
        body: fd,
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error)
      }
      toast.success('Arquivo enviado!')
      // reload
      const r2 = await fetch(`/api/pm/tasks/${task.id}/attachments`, { headers: authHeaders })
      if (r2.ok) { const d = await r2.json(); setAttachments(d.attachments ?? []) }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro no upload')
    } finally {
      setUploading(false)
    }
  }

  async function deleteAttachment(attId: string) {
    if (!confirm('Remover este arquivo?')) return
    await fetch(`/api/pm/attachments/${attId}`, { method: 'DELETE', headers: authHeaders })
    setAttachments(prev => prev.filter(a => a.id !== attId))
    toast.success('Arquivo removido')
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  }

  function mimeIcon(mime: string) {
    if (mime === 'application/pdf') return '📄'
    if (mime.includes('sheet') || mime.includes('excel') || mime === 'text/csv') return '📊'
    if (mime.startsWith('image/')) return '🖼'
    if (mime.includes('word')) return '📝'
    return '📎'
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-2">
            <SheetTitle className="text-sm font-semibold leading-tight line-clamp-2 flex-1">
              {task.title}
            </SheetTitle>
            <div className="flex items-center gap-1 shrink-0">
              <button
                className="text-muted-foreground hover:text-red-500 transition-colors"
                onClick={deleteTask}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="detail" className="flex flex-col flex-1 min-h-0">
          <TabsList className="shrink-0 mx-5 mt-3 h-8 grid grid-cols-4 gap-1">
            <TabsTrigger value="detail"  className="text-xs">Detalhes</TabsTrigger>
            <TabsTrigger value="comments" className="text-xs" onClick={loadComments}>
              Comentários {task.comment_count > 0 ? `(${task.comment_count})` : ''}
            </TabsTrigger>
            <TabsTrigger value="audio" className="text-xs">
              <Mic className="h-3 w-3 mr-1" />
              Observações {task.audio_count > 0 ? `(${task.audio_count})` : ''}
            </TabsTrigger>
            <TabsTrigger value="files" className="text-xs" onClick={loadAttachments}>
              <Paperclip className="h-3 w-3 mr-1" />
              Arquivos {task.attachment_count > 0 ? `(${task.attachment_count})` : ''}
            </TabsTrigger>
          </TabsList>

          {/* ── Detalhes ── */}
          <TabsContent value="detail" className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">Título</label>
              <Input value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium">Descrição</label>
              <Textarea rows={3} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="text-sm resize-none"
                placeholder="Detalhes da tarefa..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium">Status</label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium">Prioridade</label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium">Story Points</label>
                <Input type="number" min={0} className="h-8 text-xs"
                  value={form.story_points}
                  onChange={e => setForm(f => ({ ...f, story_points: e.target.value }))}
                  placeholder="pts"
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium">Vencimento</label>
                <Input type="date" className="h-8 text-xs"
                  value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              {task.reporter_name && <p>Criado por: <span className="font-medium">{task.reporter_name}</span></p>}
              {task.assignee_name && <p>Responsável: <span className="font-medium">{task.assignee_name}</span></p>}
              <p>Criado em: {new Date(task.created_at).toLocaleDateString('pt-BR')}</p>
            </div>

            <div className="flex justify-between pt-2 border-t">
              <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Salvar
              </Button>
            </div>
          </TabsContent>

          {/* ── Comentários ── */}
          <TabsContent value="comments" className="flex flex-col flex-1 min-h-0 px-5 py-3">
            <div className="flex-1 overflow-y-auto space-y-3 mb-3">
              {comments.length === 0 && (
                <p className="text-xs text-center text-muted-foreground py-8">
                  Nenhum comentário ainda.
                </p>
              )}
              {comments.map(c => (
                <div key={c.id} className="flex gap-2">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">
                    {c.user_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 bg-muted/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold">{c.user_name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-xs whitespace-pre-wrap">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 shrink-0">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                {user?.full_name?.charAt(0).toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 flex gap-2">
                <Textarea
                  rows={2}
                  className="text-xs resize-none flex-1"
                  placeholder="Escreva um comentário..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && e.ctrlKey) sendComment()
                  }}
                />
                <Button size="sm" className="self-end h-8" onClick={sendComment} disabled={sendingComment || !newComment.trim()}>
                  {sendingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 text-right">Ctrl+Enter para enviar</p>
          </TabsContent>

          {/* ── Observações de Voz ── */}
          <TabsContent value="audio" className="flex-1 overflow-y-auto px-5 py-3">
            <AudioNoteRecorder taskId={task.id} />
          </TabsContent>

          {/* ── Arquivos ── */}
          <TabsContent value="files" className="flex flex-col flex-1 min-h-0 px-5 py-3">
            {/* Upload area */}
            <label className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors mb-4 shrink-0 ${uploading ? 'opacity-50' : 'hover:border-primary/50 hover:bg-primary/5'}`}>
              {uploading
                ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                : <Upload className="h-5 w-5 text-muted-foreground" />
              }
              <span className="text-xs text-muted-foreground text-center">
                {uploading ? 'Enviando...' : 'Clique ou arraste PDF, Excel, CSV, Word, PNG, JPG (máx 50MB)'}
              </span>
              <input
                type="file"
                className="hidden"
                disabled={uploading}
                accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.png,.jpg,.jpeg,.gif"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) uploadFile(file)
                  e.target.value = ''
                }}
              />
            </label>

            {/* Files list */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {attachments.length === 0 && (
                <p className="text-xs text-center text-muted-foreground py-8">
                  Nenhum arquivo ainda.
                </p>
              )}
              {attachments.map(att => (
                <div key={att.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-white hover:bg-muted/20 transition-colors">
                  <span className="text-lg shrink-0">{mimeIcon(att.mime_type)}</span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={att.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-primary hover:underline truncate block"
                    >
                      {att.filename}
                    </a>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{formatBytes(att.file_size)}</span>
                      <span className="text-[10px] text-muted-foreground">{att.user_name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(att.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 uppercase">
                      {att.filename.split('.').pop()}
                    </Badge>
                    <button
                      className="text-muted-foreground hover:text-red-500 transition-colors"
                      onClick={() => deleteAttachment(att.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
