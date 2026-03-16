import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom'
import ProjectList      from './pages/pm/ProjectList'
import ProjectKanban    from './pages/pm/ProjectKanban'
import ProjectDashboard from './pages/pm/ProjectDashboard'
import ProjectBacklog   from './pages/pm/ProjectBacklog'
import ProjectMembers   from './pages/pm/ProjectMembers'
import ProjectSprints   from './pages/pm/ProjectSprints'
import ProjectPhases    from './pages/pm/ProjectPhases'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import GestaoAmbiente from './pages/GestaoAmbiente'
import AdminUsers from './pages/AdminUsers'
import TiposProjeto from './pages/TiposProjeto'
import TemplatesProjeto from './pages/TemplatesProjeto'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import { AppRail } from '@/components/AppRail'
import { FilialSelector } from '@/components/FilialSelector'
import { CompanySwitcher } from '@/components/CompanySwitcher'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { FilialProvider } from './contexts/FilialContext'
import { getActiveModule, modules } from '@/lib/navigation'
import { cn } from '@/lib/utils'

const queryClient = new QueryClient()

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
      <h1 className="text-2xl font-bold text-muted-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">Este módulo está em desenvolvimento.</p>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, user } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  if (user?.role !== 'admin') return <Navigate to="/pm" replace />
  return <>{children}</>
}

// ── Barra de abas por módulo ─────────────────────────────────────────────────
function ModuleTabs() {
  const location   = useLocation()
  const moduleId   = getActiveModule(location.pathname)
  const moduleCfg  = modules[moduleId]

  if (!moduleCfg || moduleCfg.tabs.length === 0) return null

  return (
    <div className="border-b bg-white px-4 flex items-center gap-0.5 overflow-x-auto shrink-0 h-10">
      {moduleCfg.tabs.map(tab => {
        const isActive   = location.pathname === tab.path
        const isDisabled = tab.disabled
        return isDisabled ? (
          <span
            key={tab.path}
            className="px-3 py-1.5 text-xs rounded-md text-muted-foreground/50 cursor-not-allowed whitespace-nowrap"
          >
            {tab.label}
          </span>
        ) : (
          <Link
            key={tab.path}
            to={tab.path}
            className={cn(
              'px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition-colors',
              isActive
                ? tab.danger
                  ? 'bg-red-50 text-red-700 font-semibold'
                  : 'bg-primary/10 text-primary font-semibold'
                : tab.danger
                  ? 'text-red-500 hover:bg-red-50 hover:text-red-700'
                  : 'text-muted-foreground hover:bg-gray-100 hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}

// ── Cabeçalho (módulo + controles globais) ───────────────────────────────────
function AppHeader() {
  const location  = useLocation()
  const moduleId  = getActiveModule(location.pathname)
  const moduleCfg = modules[moduleId]

  return (
    <header className="flex items-center justify-between h-12 border-b bg-white px-4 shrink-0">
      <span className="text-sm font-semibold text-foreground">
        {moduleCfg?.label ?? 'Gestão de Projetos'}
      </span>
      <div className="flex items-center gap-2">
        <FilialSelector />
        <CompanySwitcher compact />
      </div>
    </header>
  )
}

// ── Layout principal ─────────────────────────────────────────────────────────
function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppRail />
      <div className="flex flex-col flex-1 min-w-0">
        <AppHeader />
        <ModuleTabs />
        <main className="flex-1 overflow-auto">
          <div className="p-4">
            <Routes>
              <Route path="/" element={<Navigate to="/pm" replace />} />

              {/* Gestão de Projetos */}
              <Route path="/pm"                          element={<ProjectList />} />
              <Route path="/pm/:id/kanban"               element={<ProjectKanban />} />
              <Route path="/pm/:id/dashboard"            element={<ProjectDashboard />} />
              <Route path="/pm/:id/backlog"              element={<ProjectBacklog />} />
              <Route path="/pm/:id/members"              element={<ProjectMembers />} />
              <Route path="/pm/:id/sprints"              element={<ProjectSprints />} />
              <Route path="/pm/:id/phases"               element={<ProjectPhases />} />
              <Route path="/pm/:id/epics"                element={<Navigate to="../backlog" relative="path" replace />} />
              <Route path="/pm/:id/settings"             element={<ComingSoon title="Configurações do Projeto" />} />

              {/* Configurações (compartilhadas APU01/02/03) */}
              <Route path="/config/ambiente"       element={<ProtectedRoute><GestaoAmbiente /></ProtectedRoute>} />
              <Route path="/config/usuarios"       element={<AdminRoute><AdminUsers /></AdminRoute>} />
              <Route path="/config/tipos-projeto"       element={<AdminRoute><TiposProjeto /></AdminRoute>} />
              <Route path="/config/templates-projeto"  element={<AdminRoute><TemplatesProjeto /></AdminRoute>} />
            </Routes>
          </div>
        </main>
      </div>
      <Toaster />
    </div>
  )
}

// ── App root ─────────────────────────────────────────────────────────────────
function App() {
  console.log('App Version: 1.0.0 — FB_APU03 Gestão de Projetos')
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <Routes>
            <Route path="/login"          element={<Login />} />
            <Route path="/register"       element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-senha"    element={<ResetPassword />} />
            <Route path="/*" element={
              <ProtectedRoute>
                <FilialProvider>
                  <AppLayout />
                </FilialProvider>
              </ProtectedRoute>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
