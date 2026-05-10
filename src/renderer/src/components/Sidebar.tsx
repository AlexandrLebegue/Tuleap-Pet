import * as React from 'react'
import { NavLink } from 'react-router-dom'
import {
  Settings as SettingsIcon,
  FolderKanban,
  Sparkles,
  MessageSquare,
  Code2,
  Gauge,
  FileCode2,
  GitPullRequest,
  GitBranch,
  Wrench,
  FlaskConical
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import ConnectionStatusBadge from './ConnectionStatusBadge'
import { useSettings } from '@renderer/stores/settings.store'

type NavItem = {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const groups: NavGroup[] = [
  {
    label: 'Général',
    items: [
      { to: '/settings', label: 'Configuration', icon: SettingsIcon },
      { to: '/chatbot', label: 'Chatbot', icon: MessageSquare }
    ]
  },
  {
    label: 'Tuleap',
    items: [
      { to: '/project', label: 'Projet', icon: FolderKanban },
      { to: '/admin', label: 'Admin', icon: Gauge },
      { to: '/generation', label: 'Génération IA', icon: Sparkles },
      { to: '/git', label: 'Git Explorer', icon: GitBranch }
    ]
  },
  {
    label: 'Codeur',
    items: [
      { to: '/coder', label: 'Coder', icon: Code2 },
      { to: '/commenter', label: 'Commentateur', icon: FileCode2 },
      { to: '/commenter-pr', label: 'Commenter PR', icon: GitPullRequest },
      { to: '/corrector', label: 'Correcteur', icon: Wrench },
      { to: '/test-generator', label: 'Tests unitaires', icon: FlaskConical }
    ]
  }
]

function Sidebar(): React.JSX.Element {
  const projectId = useSettings((s) => s.config.projectId)
  const projects = useSettings((s) => s.projects)
  const selectedProject = projects.find((p) => p.id === projectId) ?? null

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-muted/30">
      <div className="px-4 py-5 border-b border-border">
        <h1 className="text-sm font-semibold tracking-tight">Tuleap AI Companion</h1>
        <div className="mt-2 flex items-center gap-2">
          <ConnectionStatusBadge />
        </div>
        {selectedProject && (
          <p className="mt-2 truncate text-xs text-muted-foreground" title={selectedProject.label}>
            {selectedProject.label}
          </p>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {groups.map((group, gi) => (
          <div key={group.label} className={cn('px-2', gi > 0 && 'mt-4')}>
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-accent text-accent-foreground font-medium'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                      )
                    }
                  >
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-3 text-xs text-muted-foreground border-t border-border">
        <span className="block">v0.0.1 · Phase 0 · Local-first</span>
      </div>
    </aside>
  )
}

export default Sidebar
