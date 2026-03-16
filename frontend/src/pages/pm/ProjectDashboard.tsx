import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  PieChart, Pie, Cell, Tooltip as ChartTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts'
import { LayoutKanban, List, Users, Settings2, Download, Loader2, AlertTriangle } from 'lucide-react'
import { useAuth as useAuthCtx } from '@/contexts/AuthContext'

interface Dashboard {
  tasks_by_status: { key: string; count: number }[]
  tasks_by_priority: { key: string; count: number }[]
  tasks_by_type: { key: string; count: number }[]
  tasks_by_assignee: { key: string; count: number }[]
  total_tasks: number
  done_tasks: number
  in_progress_tasks: number
  blocked_tasks: number
  overdue_tasks: number
  progress_pct: number
}

const STATUS_COLORS: Record<string, string> = {
  backlog:     '#94a3b8',
  todo:        '#60a5fa',
  in_progress: '#fb923c',
  review:      '#a78bfa',
  done:        '#4ade80',
  blocked:     '#f87171',
}

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog', todo: 'A Fazer', in_progress: 'Em And.',
  review: 'Em Revisão', done: 'Concluído', blocked: 'Bloqueado',
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#94a3b8',
}

export default function ProjectDashboard() {
  const { id: projectId } = useParams<{ id: string }>()
  const { token, companyId } = useAuth()
  const { token: t2 } = useAuthCtx()
  const navigate = useNavigate()
  const authHeaders = { Authorization: `Bearer ${token ?? t2}`, 'X-Company-ID': companyId ?? '' }

  const { data: project } = useQuery({
    queryKey: ['pm-project', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/pm/projects/${projectId}`, { headers: authHeaders })
      return res.json()
    },
  })

  const { data: dash, isLoading } = useQuery<Dashboard>({
    queryKey: ['pm-dashboard', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/pm/projects/${projectId}/dashboard`, { headers: authHeaders })
      if (!res.ok) throw new Error('Erro')
      return res.json()
    },
    enabled: !!projectId,
  })

  function exportTasks() {
    const a = document.createElement('a')
    a.href = `/api/pm/projects/${projectId}/export/tasks`
    a.click()
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Sub-header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button onClick={() => navigate('/pm')} className="hover:text-foreground">Projetos</button>
          <span>/</span>
          <span className="font-semibold text-foreground truncate max-w-[200px]">{project?.name ?? '...'}</span>
          <span>/</span>
          <span>Dashboard</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs"
            onClick={() => navigate(`/pm/${projectId}/kanban`)}>
            <LayoutKanban className="h-3.5 w-3.5 mr-1" /> Kanban
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs"
            onClick={() => navigate(`/pm/${projectId}/backlog`)}>
            <List className="h-3.5 w-3.5 mr-1" /> Backlog
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs"
            onClick={() => navigate(`/pm/${projectId}/members`)}>
            <Users className="h-3.5 w-3.5 mr-1" /> Equipe
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={exportTasks}>
            <Download className="h-3.5 w-3.5 mr-1" /> Exportar Excel
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Total de Tarefas" value={dash?.total_tasks ?? 0} color="text-foreground" />
        <KPICard label="Concluídas"       value={dash?.done_tasks ?? 0}        color="text-green-600" />
        <KPICard label="Em Andamento"     value={dash?.in_progress_tasks ?? 0} color="text-orange-500" />
        <KPICard label="Bloqueadas"       value={dash?.blocked_tasks ?? 0}     color="text-red-500"
          icon={dash?.blocked_tasks ? <AlertTriangle className="h-4 w-4 text-red-400" /> : undefined}
        />
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex justify-between text-xs mb-2">
            <span className="font-medium">Progresso Geral</span>
            <span className="text-muted-foreground">
              {dash?.done_tasks ?? 0}/{dash?.total_tasks ?? 0} tarefas concluídas
            </span>
          </div>
          <Progress value={dash?.progress_pct ?? 0} className="h-3" />
          <p className="text-xs text-right mt-1 text-muted-foreground">{dash?.progress_pct ?? 0}%</p>
          {(dash?.overdue_tasks ?? 0) > 0 && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {dash!.overdue_tasks} tarefa(s) em atraso
            </p>
          )}
        </CardContent>
      </Card>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* By Status (Donut) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold">Tarefas por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={(dash?.tasks_by_status ?? []).map(d => ({
                    name: STATUS_LABELS[d.key] ?? d.key,
                    value: d.count,
                  }))}
                  cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                  paddingAngle={2} dataKey="value"
                >
                  {(dash?.tasks_by_status ?? []).map((d, i) => (
                    <Cell key={i} fill={STATUS_COLORS[d.key] ?? '#94a3b8'} />
                  ))}
                </Pie>
                <ChartTooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={(v: number, n: string) => [v, n]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
              {(dash?.tasks_by_status ?? []).map(d => (
                <div key={d.key} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full"
                    style={{ background: STATUS_COLORS[d.key] ?? '#94a3b8' }} />
                  <span className="text-[10px] text-muted-foreground">
                    {STATUS_LABELS[d.key] ?? d.key} ({d.count})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* By Assignee (Bar) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold">Tarefas por Responsável</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={(dash?.tasks_by_assignee ?? []).map(d => ({ name: d.key.split(' ')[0], value: d.count }))}
                layout="vertical"
                margin={{ left: 0, right: 10, top: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} />
                <ChartTooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* By Priority */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold">Tarefas por Prioridade</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={(dash?.tasks_by_priority ?? []).map(d => ({
                name: d.key === 'critical' ? 'Crítico' : d.key === 'high' ? 'Alto' : d.key === 'medium' ? 'Médio' : 'Baixo',
                value: d.count, key: d.key,
              }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <ChartTooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {(dash?.tasks_by_priority ?? []).map((d, i) => (
                    <Cell key={i} fill={PRIORITY_COLORS[d.key] ?? '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* By Type */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold">Tarefas por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 py-2">
              {(dash?.tasks_by_type ?? []).map(d => {
                const pct = dash!.total_tasks > 0 ? (d.count / dash!.total_tasks) * 100 : 0
                const labels: Record<string, string> = {
                  story: 'História', task: 'Tarefa', bug: 'Bug', improvement: 'Melhoria', risk: 'Risco',
                }
                return (
                  <div key={d.key} className="space-y-0.5">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{labels[d.key] ?? d.key}</span>
                      <span>{d.count}</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function KPICard({
  label, value, color, icon
}: { label: string; value: number; color: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  )
}
