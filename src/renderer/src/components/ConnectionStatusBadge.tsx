import * as React from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { useSettings } from '@renderer/stores/settings.store'

function ConnectionStatusBadge(): React.JSX.Element {
  const status = useSettings((s) => s.status)
  const hasToken = useSettings((s) => s.config.hasToken)
  const url = useSettings((s) => s.config.tuleapUrl)

  if (!url || !hasToken) {
    return <Badge variant="outline">Non configuré</Badge>
  }
  if (status === 'testing') {
    return <Badge variant="secondary">Test…</Badge>
  }
  if (status === 'ok') {
    return <Badge variant="success">Connecté</Badge>
  }
  if (status === 'error') {
    return <Badge variant="destructive">Erreur</Badge>
  }
  return <Badge variant="outline">Inconnu</Badge>
}

export default ConnectionStatusBadge
