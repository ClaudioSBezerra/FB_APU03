import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Kanban, LayoutDashboard, List, Users, Settings2,
  Milestone, GitBranch
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { label: 'Kanban',    path: 'kanban',    icon: Kanban },
  { label: 'Backlog',   path: 'backlog',   icon: List },
  { label: 'Sprints',   path: 'sprints',   icon: GitBranch },
  { label: 'Fases',     path: 'phases',    icon: Milestone },
  { label: 'Dashboard', path: 'dashboard', icon: LayoutDashboard },
  { label: 'Equipe',    path: 'members',   icon: Users },
  { label: 'Config',    path: 'settings',  icon: Settings2 },
]

interface Props {
  projectId: string
  projectName?: string
}

export function ProjectNav({ projectId, projectName }: Props) {
  const navigate  = useNavigate()
  const location  = useLocation()

  return (
    <div className="flex items-center justify-between mb-3 shrink-0 flex-wrap gap-2">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/pm')}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Projetos
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="text-xs font-semibold truncate max-w-[200px]">
          {projectName ?? '...'}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 flex-wrap">
        {NAV_ITEMS.map(item => {
          const fullPath = `/pm/${projectId}/${item.path}`
          const isActive = location.pathname === fullPath
          const Icon = item.icon
          return (
            <Button
              key={item.path}
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 text-xs',
                isActive && 'bg-primary/10 text-primary font-semibold'
              )}
              onClick={() => navigate(fullPath)}
            >
              <Icon className="h-3.5 w-3.5 mr-1" />
              {item.label}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
