import * as React from 'react'
import PhasePlaceholder from '@renderer/components/PhasePlaceholder'

function Project(): React.JSX.Element {
  return (
    <PhasePlaceholder
      title="Projet"
      description="Trackers, artéfacts, parents/enfants — disponible une fois la connexion Tuleap configurée."
      phase={0}
    />
  )
}

export default Project
