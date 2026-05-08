import * as React from 'react'
import { Badge } from '@renderer/components/ui/badge'

type Props = {
  title: string
  description: string
  phase: number
}

function PhasePlaceholder({ title, description, phase }: Props): React.JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <Badge variant="outline">Phase {phase}</Badge>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <div className="mt-8 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Cet onglet sera implémenté en Phase {phase}.
      </div>
    </div>
  )
}

export default PhasePlaceholder
