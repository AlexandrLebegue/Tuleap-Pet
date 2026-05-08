import * as React from 'react'

type Props = {
  html: string
  className?: string
}

/**
 * Sandboxed iframe rendering Marp's HTML output. The srcDoc keeps the
 * document fully off-origin and the sandbox attribute strips JS, top-nav
 * and form submissions — the renderer treats LLM output as untrusted
 * even after Marp's own sanitisation.
 */
function MarpPreviewFrame({ html, className }: Props): React.JSX.Element {
  return (
    <iframe
      title="Aperçu Marp"
      srcDoc={html}
      sandbox=""
      className={className}
      // tone down default white-on-white iframe outline
      style={{ background: '#fff', border: 0, width: '100%', height: '100%' }}
    />
  )
}

export default MarpPreviewFrame
