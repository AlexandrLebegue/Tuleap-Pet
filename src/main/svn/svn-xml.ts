/**
 * Pure parsers for `svn --xml` output. This module imports nothing (no Electron,
 * no Node APIs) so it can be unit-tested in isolation. svn's XML is
 * machine-generated and structurally stable, so a small targeted parser is
 * enough — no XML dependency is pulled in.
 */

export type SvnPathEntry = {
  /** Entry name (e.g. "trunk", "branches", "tags", or a file/dir under a path). */
  name: string
  kind: 'dir' | 'file'
  /** Last-changed revision, when reported. */
  revision: number | null
}

export type SvnCommit = {
  /** Revision number as a string ("123") to stay shape-compatible with GitCommit.id. */
  id: string
  /** "r123" — short display form. */
  shortId: string
  /** First line of the commit message. */
  title: string
  authorName: string
  authoredDate: string
}

export type SvnInfo = {
  url: string
  relativeUrl: string
  repositoryRoot: string
  revision: number | null
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
}

/** Extract the text content of the first `<tag>…</tag>` inside `block`, or ''. */
function tagText(block: string, tag: string): string {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(block)
  return m ? decodeXmlEntities(m[1]!) : ''
}

/** Read the value of an XML attribute (e.g. revision="3" / kind="dir") in `block`. */
function attr(block: string, name: string): string {
  const m = new RegExp(`${name}\\s*=\\s*"([^"]*)"`).exec(block)
  return m ? decodeXmlEntities(m[1]!) : ''
}

/** Iterate over every `<tag …>…</tag>` block in `xml`. */
function blocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`, 'g')
  return xml.match(re) ?? []
}

/** Parse `svn list --xml` into directory/file entries. */
export function parseSvnList(xml: string): SvnPathEntry[] {
  return blocks(xml, 'entry').map((b) => {
    const commit = blocks(b, 'commit')[0] ?? ''
    const rev = attr(commit, 'revision')
    return {
      name: tagText(b, 'name'),
      kind: attr(b, 'kind') === 'file' ? 'file' : 'dir',
      revision: rev ? Number.parseInt(rev, 10) : null
    }
  })
}

/** Parse `svn log --xml` into commit entries (newest first, as svn emits them). */
export function parseSvnLog(xml: string): SvnCommit[] {
  return blocks(xml, 'logentry').map((b) => {
    const rev = attr(b, 'revision')
    const msg = tagText(b, 'msg')
    const title = (msg.split('\n')[0] ?? '').trim()
    return {
      id: rev,
      shortId: rev ? `r${rev}` : '',
      title,
      authorName: tagText(b, 'author'),
      authoredDate: tagText(b, 'date')
    }
  })
}

/** Parse `svn info --xml` for a single entry. */
export function parseSvnInfo(xml: string): SvnInfo | null {
  const entry = blocks(xml, 'entry')[0]
  if (!entry) return null
  const rev = attr(entry, 'revision')
  return {
    url: tagText(entry, 'url'),
    relativeUrl: tagText(entry, 'relative-url'),
    repositoryRoot: tagText(blocks(entry, 'repository')[0] ?? '', 'root'),
    revision: rev ? Number.parseInt(rev, 10) : null
  }
}
