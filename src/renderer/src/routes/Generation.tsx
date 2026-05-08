import * as React from 'react'
import PhasePlaceholder from '@renderer/components/PhasePlaceholder'

function Generation(): React.JSX.Element {
  return (
    <PhasePlaceholder
      title="Génération IA"
      description="Sprint review, status report, présentations Marp → PPTX."
      phase={1}
    />
  )
}

export default Generation
