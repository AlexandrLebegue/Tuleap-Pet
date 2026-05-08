import * as React from 'react'
import PhasePlaceholder from '@renderer/components/PhasePlaceholder'

function Admin(): React.JSX.Element {
  return (
    <PhasePlaceholder
      title="Admin"
      description="Vision globale par une IA monitor — scope à définir."
      phase={4}
    />
  )
}

export default Admin
