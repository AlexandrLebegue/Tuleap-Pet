import * as React from 'react'
import PhasePlaceholder from '@renderer/components/PhasePlaceholder'

function Coder(): React.JSX.Element {
  return (
    <PhasePlaceholder
      title="Coder"
      description="Lance OpenCode avec le contexte d'un ticket pré-injecté."
      phase={3}
    />
  )
}

export default Coder
