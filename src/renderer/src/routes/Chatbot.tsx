import * as React from 'react'
import PhasePlaceholder from '@renderer/components/PhasePlaceholder'

function Chatbot(): React.JSX.Element {
  return (
    <PhasePlaceholder
      title="Chatbot"
      description="Chat avec accès aux tools Tuleap, persistance locale."
      phase={2}
    />
  )
}

export default Chatbot
