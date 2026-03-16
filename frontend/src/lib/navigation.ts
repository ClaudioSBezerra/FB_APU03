export interface ModuleTab {
  label: string
  path: string
  disabled?: boolean
  danger?: boolean
}

export interface ModuleConfig {
  label: string
  tabs: ModuleTab[]
}

export const modules: Record<string, ModuleConfig> = {
  projetos: {
    label: 'Projetos',
    tabs: [
      { label: 'Meus Projetos', path: '/pm' },
    ],
  },
  config: {
    label: 'Configurações',
    tabs: [
      { label: 'Ambiente',       path: '/config/ambiente' },
      { label: 'Usuários',       path: '/config/usuarios' },
      { label: 'Tipos de Projeto', path: '/config/tipos-projeto' },
      { label: 'Templates',       path: '/config/templates-projeto' },
    ],
  },
}

export function getActiveModule(pathname: string): string {
  if (pathname.startsWith('/pm')) return 'projetos'
  if (pathname.startsWith('/config/')) return 'config'
  return 'projetos'
}
