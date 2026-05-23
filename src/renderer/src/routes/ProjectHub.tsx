import * as React from 'react'
import { useState } from 'react'
import Project from './Project'
import Admin from './Admin'
import KnowledgeBase from './KnowledgeBase'

type Tab = 'kanban' | 'admin' | 'knowledge'

const TABS: { id: Tab; label: string }[] = [
  { id: 'kanban', label: 'Kanban' },
  { id: 'admin', label: 'Admin' },
  { id: 'knowledge', label: 'Base de connaissances' }
]

export default function ProjectHub(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('kanban')

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b px-4 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-accent text-accent-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Keep all tabs mounted to preserve Zustand state */}
      <div className={tab === 'kanban' ? 'flex flex-1 overflow-hidden' : 'hidden'}>
        <Project />
      </div>
      <div className={tab === 'admin' ? 'flex flex-1 overflow-hidden' : 'hidden'}>
        <Admin />
      </div>
      <div className={tab === 'knowledge' ? 'flex flex-1 overflow-hidden' : 'hidden'}>
        <KnowledgeBase />
      </div>
    </div>
  )
}
