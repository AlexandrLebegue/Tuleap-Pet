import * as React from 'react'
import { NavLink } from 'react-router-dom'
import {
  Settings as SettingsIcon,
  FolderKanban,
  Sparkles,
  MessageSquare,
  Code2,
  Gauge
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import ConnectionStatusBadge from './ConnectionStatusBadge'
import { useSettings } from '@renderer/stores/settings.store'

type NavItem = {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  phase: number
}

const items: NavItem[] = [
  { to: '/settings', label: 'Réglages', icon: SettingsIcon, phase: 0 },
  { to: '/project', label: 'Projet', icon: FolderKanban, phase: 0 },
  { to: '/generation', label: 'Génération IA', icon: Sparkles, phase: 1 },
  { to: '/chatbot', label: 'Chatbot', icon: MessageSquare, phase: 2 },
  { to: '/coder', label: 'Coder', icon: Code2, phase: 3 },
  { to: '/admin', label: 'Admin', icon: Gauge, phase: 4 }
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
      <nav className="flex flex-col gap-1 p-2">
        {items.map((item) => {
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
      </nav>
      <div className="mt-auto p-3 text-xs text-muted-foreground">
        <span className="block">v0.0.1 · Phase 0 · Local-first</span>
      </div>
    </aside>
  )
}

export default Sidebar
