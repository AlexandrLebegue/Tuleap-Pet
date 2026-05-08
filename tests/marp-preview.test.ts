import { describe, expect, it } from 'vitest'
import { renderMarpPreview } from '../src/main/marp/preview'

describe('renderMarpPreview', () => {
  it('returns a self-contained HTML document with inlined CSS and a CSP', () => {
    const md = '---\nmarp: true\n---\n\n# Hello\n'
    const result = renderMarpPreview(md)
    expect(result.html).toMatch(/^<!doctype html>/i)
    expect(result.html).toContain('Content-Security-Policy')
    expect(result.html).toContain("default-src 'none'")
    expect(result.html).toContain('<style>')
    expect(result.html).toContain('Hello')
    expect(result.css.length).toBeGreaterThan(100)
  })

  it('does not propagate raw <script> tags from the source markdown', () => {
    const md = '---\nmarp: true\n---\n\n# Demo\n\n<script>alert(1)</script>\n'
    const result = renderMarpPreview(md)
    expect(result.html).not.toContain('<script>alert(1)</script>')
  })

  it('produces a non-empty body even for a minimal slide', () => {
    const result = renderMarpPreview('---\nmarp: true\n---\n\n# Title\n\n---\n\n## Second\n')
    expect(result.body.length).toBeGreaterThan(0)
    expect(result.body).toContain('Title')
    expect(result.body).toContain('Second')
  })
})
