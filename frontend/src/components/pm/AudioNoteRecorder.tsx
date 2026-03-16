import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Mic, Square, Loader2, Play, Pause, Trash2, Save, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AudioNote {
  id: string
  task_id: string
  user_id: string
  user_name: string
  audio_filename: string
  audio_url: string
  audio_size_bytes: number
  duration_secs: number
  transcription: string
  transcription_status: string
  observation: string
  created_at: string
}

interface Props {
  taskId: string
}

type RecordState = 'idle' | 'recording' | 'uploading' | 'done' | 'error'

export function AudioNoteRecorder({ taskId }: Props) {
  const { token, companyId } = useAuth()
  const authHeaders = { Authorization: `Bearer ${token}`, 'X-Company-ID': companyId ?? '' }

  const [notes, setNotes] = useState<AudioNote[]>([])
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [state, setState] = useState<RecordState>('idle')
  const [seconds, setSeconds] = useState(0)
  const [editingObs, setEditingObs] = useState<Record<string, string>>({})
  const [playingId, setPlayingId] = useState<string | null>(null)

  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({})
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // load existing notes
  useEffect(() => {
    loadNotes()
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadNotes() {
    setLoadingNotes(true)
    try {
      const res = await fetch(`/api/pm/tasks/${taskId}/audio`, { headers: authHeaders })
      if (res.ok) {
        const d = await res.json()
        setNotes(d.audio_notes ?? [])
        // init observation text
        const obs: Record<string, string> = {}
        for (const n of d.audio_notes ?? []) {
          obs[n.id] = n.observation || n.transcription || ''
        }
        setEditingObs(obs)
      }
    } finally {
      setLoadingNotes(false)
    }
  }

  function startPolling(noteId: string) {
    pollingRef.current = setInterval(async () => {
      const res = await fetch(`/api/pm/tasks/${taskId}/audio`, { headers: authHeaders })
      if (!res.ok) return
      const d = await res.json()
      const n = (d.audio_notes as AudioNote[])?.find(n => n.id === noteId)
      if (n && n.transcription_status === 'done') {
        clearInterval(pollingRef.current!)
        pollingRef.current = null
        setNotes(d.audio_notes ?? [])
        setEditingObs(prev => ({
          ...prev,
          [noteId]: n.observation || n.transcription || '',
        }))
        setState('done')
        toast.success('Transcrição concluída!')
      } else if (n && n.transcription_status === 'failed') {
        clearInterval(pollingRef.current!)
        pollingRef.current = null
        setNotes(d.audio_notes ?? [])
        setState('error')
        toast.error('Falha na transcrição. Você pode editar o texto manualmente.')
      }
    }, 2000)
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunks.current = []
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mr.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data) }
      mr.start(100)
      mediaRecorder.current = mr
      setState('recording')
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } catch {
      toast.error('Não foi possível acessar o microfone. Verifique as permissões.')
    }
  }

  async function stopAndUpload() {
    if (!mediaRecorder.current) return
    clearInterval(timerRef.current!)
    const duration = seconds

    mediaRecorder.current.stop()
    mediaRecorder.current.stream.getTracks().forEach(t => t.stop())

    await new Promise<void>(res => { mediaRecorder.current!.onstop = () => res() })
    const blob = new Blob(chunks.current, { type: 'audio/webm' })

    setState('uploading')
    const fd = new FormData()
    fd.append('audio', blob, `gravacao_${Date.now()}.webm`)
    fd.append('duration', String(duration))

    try {
      const res = await fetch(`/api/pm/tasks/${taskId}/audio`, {
        method: 'POST',
        headers: authHeaders,
        body: fd,
      })
      if (!res.ok) throw new Error('Erro no upload')
      const d = await res.json()
      toast.info('Áudio enviado. Transcrevendo com Z.AI...')
      await loadNotes()
      startPolling(d.id)
    } catch {
      setState('error')
      toast.error('Erro ao enviar áudio')
    }
  }

  async function saveObservation(noteId: string) {
    const obs = editingObs[noteId] ?? ''
    try {
      await fetch(`/api/pm/audio/${noteId}`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ observation: obs }),
      })
      toast.success('Observação salva!')
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, observation: obs } : n))
    } catch {
      toast.error('Erro ao salvar')
    }
  }

  async function deleteNote(noteId: string) {
    if (!confirm('Remover esta nota de voz?')) return
    try {
      await fetch(`/api/pm/audio/${noteId}`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      setNotes(prev => prev.filter(n => n.id !== noteId))
      toast.success('Nota removida')
    } catch {
      toast.error('Erro ao remover')
    }
  }

  function togglePlay(note: AudioNote) {
    const audio = audioRefs.current[note.id]
    if (!audio) return
    if (playingId === note.id) {
      audio.pause()
      setPlayingId(null)
    } else {
      if (playingId && audioRefs.current[playingId]) {
        audioRefs.current[playingId].pause()
      }
      audio.play()
      setPlayingId(note.id)
      audio.onended = () => setPlayingId(null)
    }
  }

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  }

  return (
    <div className="space-y-4">
      {/* Recorder */}
      <div className="flex flex-col items-center gap-3 p-4 rounded-xl border bg-muted/30">
        {state === 'idle' || state === 'done' || state === 'error' ? (
          <>
            <p className="text-xs text-muted-foreground">
              Grave uma observação de voz — a IA Z.AI transcreverá automaticamente
            </p>
            <Button size="sm" onClick={startRecording} className="gap-2">
              <Mic className="h-4 w-4" />
              Gravar Nota de Voz
            </Button>
          </>
        ) : state === 'recording' ? (
          <>
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="text-sm font-mono font-semibold text-red-600">
                {formatTime(seconds)} — Gravando...
              </span>
            </div>
            <Button size="sm" variant="destructive" onClick={stopAndUpload} className="gap-2">
              <Square className="h-4 w-4" />
              Parar e Enviar
            </Button>
          </>
        ) : state === 'uploading' ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Enviando e transcrevendo com Z.AI...
          </div>
        ) : null}
      </div>

      {/* Notes list */}
      {loadingNotes ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-xs text-center text-muted-foreground py-4">
          Nenhuma nota de voz ainda.
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map(note => (
            <div key={note.id} className="rounded-lg border bg-white p-3 space-y-2">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{note.user_name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(note.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                  {note.duration_secs > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatTime(note.duration_secs)}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {formatBytes(note.audio_size_bytes)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {/* Transcription status */}
                  {note.transcription_status === 'processing' && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-300 text-orange-600">
                      <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                      Transcrevendo...
                    </Badge>
                  )}
                  {note.transcription_status === 'done' && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-300 text-green-600">
                      ✓ Transcrito
                    </Badge>
                  )}
                  {note.transcription_status === 'failed' && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-300 text-red-600">
                      Falhou
                    </Badge>
                  )}
                  <button
                    className="text-muted-foreground hover:text-red-500 transition-colors"
                    onClick={() => deleteNote(note.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Audio player */}
              <div className="flex items-center gap-2">
                <button
                  className={cn(
                    'flex items-center justify-center w-7 h-7 rounded-full transition-colors',
                    playingId === note.id
                      ? 'bg-primary text-white'
                      : 'bg-primary/10 text-primary hover:bg-primary/20'
                  )}
                  onClick={() => togglePlay(note)}
                >
                  {playingId === note.id
                    ? <Pause className="h-3.5 w-3.5" />
                    : <Play className="h-3.5 w-3.5 ml-0.5" />
                  }
                </button>
                <div className="flex-1 h-1 bg-muted rounded-full">
                  <div className={cn(
                    'h-1 bg-primary rounded-full transition-all',
                    playingId === note.id ? 'w-1/3' : 'w-0'
                  )} />
                </div>
                {/* Hidden native audio element */}
                <audio
                  ref={el => { if (el) audioRefs.current[note.id] = el }}
                  src={note.audio_url}
                  preload="none"
                />
              </div>

              {/* Observation / Transcription */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                    Observação
                  </label>
                  {note.transcription && editingObs[note.id] === (note.observation || note.transcription) ? null : (
                    <button
                      className="text-[10px] text-muted-foreground flex items-center gap-0.5 hover:text-foreground"
                      onClick={() => setEditingObs(prev => ({
                        ...prev,
                        [note.id]: note.transcription
                      }))}
                    >
                      <RefreshCw className="h-2.5 w-2.5" /> Usar transcrição
                    </button>
                  )}
                </div>
                <Textarea
                  rows={3}
                  className="text-xs resize-none"
                  value={editingObs[note.id] ?? ''}
                  onChange={e => setEditingObs(prev => ({ ...prev, [note.id]: e.target.value }))}
                  placeholder={
                    note.transcription_status === 'processing'
                      ? 'Aguardando transcrição da Z.AI...'
                      : 'Escreva ou edite a observação...'
                  }
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs"
                    onClick={() => saveObservation(note.id)}
                  >
                    <Save className="h-3 w-3 mr-1" /> Salvar
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
