import { describe, it, expect } from 'vitest'
import { parseSvnList, parseSvnLog, parseSvnInfo } from '../../src/main/svn/svn-xml'

// Fixtures captured from a real `svn 1.14` instance (file:// repo, standard layout).

const LIST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<lists>
<list path="file:///repo">
<entry kind="dir"><name>branches</name>
<commit revision="1"><author>root</author><date>2026-06-24T14:21:38.314474Z</date></commit></entry>
<entry kind="dir"><name>tags</name>
<commit revision="1"><author>root</author><date>2026-06-24T14:21:38.314474Z</date></commit></entry>
<entry kind="dir"><name>trunk</name>
<commit revision="3"><author>alice</author><date>2026-06-24T14:21:38.435176Z</date></commit></entry>
</list>
</lists>`

const LIST_WITH_FILE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<lists><list path="file:///repo/trunk">
<entry kind="file"><name>foo.c</name>
<commit revision="2"><author>bob</author><date>2026-06-24T14:21:38.394895Z</date></commit></entry>
<entry kind="dir"><name>src</name></entry>
</list></lists>`

const LOG_XML = `<?xml version="1.0" encoding="UTF-8"?>
<log>
<logentry revision="3"><author>root</author><date>2026-06-24T14:21:38.435176Z</date>
<msg>touch foo refs #42</msg></logentry>
<logentry revision="2"><author>bob</author><date>2026-06-24T14:21:38.394895Z</date>
<msg>add foo
second line ignored</msg></logentry>
<logentry revision="1"><author>root</author><date>2026-06-24T14:21:38.314474Z</date>
<msg>init layout</msg></logentry>
</log>`

const INFO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<info><entry kind="dir" path="trunk" revision="3">
<url>file:///repo/trunk</url>
<relative-url>^/trunk</relative-url>
<repository><root>file:///repo</root><uuid>fa9cc9c5</uuid></repository>
<commit revision="3"><author>root</author><date>2026-06-24T14:21:38.435176Z</date></commit>
</entry></info>`

describe('parseSvnList', () => {
  it('parses directory entries with names, kind and last-changed revision', () => {
    const entries = parseSvnList(LIST_XML)
    expect(entries.map((e) => e.name)).toEqual(['branches', 'tags', 'trunk'])
    expect(entries.every((e) => e.kind === 'dir')).toBe(true)
    expect(entries.find((e) => e.name === 'trunk')?.revision).toBe(3)
    expect(entries.find((e) => e.name === 'branches')?.revision).toBe(1)
  })

  it('distinguishes files from dirs and tolerates a missing <commit>', () => {
    const entries = parseSvnList(LIST_WITH_FILE_XML)
    expect(entries.find((e) => e.name === 'foo.c')?.kind).toBe('file')
    expect(entries.find((e) => e.name === 'src')?.kind).toBe('dir')
    expect(entries.find((e) => e.name === 'src')?.revision).toBeNull()
  })

  it('returns [] for empty output', () => {
    expect(parseSvnList('<lists><list path="x"></list></lists>')).toEqual([])
  })
})

describe('parseSvnLog', () => {
  it('parses revisions newest-first with r-prefixed shortId and first-line title', () => {
    const commits = parseSvnLog(LOG_XML)
    expect(commits).toHaveLength(3)
    expect(commits[0]).toMatchObject({
      id: '3',
      shortId: 'r3',
      title: 'touch foo refs #42',
      authorName: 'root'
    })
    // Only the first message line becomes the title.
    expect(commits[1]!.title).toBe('add foo')
    expect(commits[1]!.authorName).toBe('bob')
    expect(commits[0]!.authoredDate).toMatch(/^2026-06-24T/)
  })

  it('returns [] when there are no log entries', () => {
    expect(parseSvnLog('<log></log>')).toEqual([])
  })
})

describe('parseSvnInfo', () => {
  it('extracts url, relative-url, repository root and revision', () => {
    const info = parseSvnInfo(INFO_XML)
    expect(info).not.toBeNull()
    expect(info!.url).toBe('file:///repo/trunk')
    expect(info!.relativeUrl).toBe('^/trunk')
    expect(info!.repositoryRoot).toBe('file:///repo')
    expect(info!.revision).toBe(3)
  })

  it('returns null when there is no <entry>', () => {
    expect(parseSvnInfo('<info></info>')).toBeNull()
  })

  it('decodes XML entities in text content', () => {
    const xml =
      '<log><logentry revision="5"><author>a</author><date>d</date>' +
      '<msg>fix &lt;tag&gt; &amp; &quot;quote&quot;</msg></logentry></log>'
    expect(parseSvnLog(xml)[0]!.title).toBe('fix <tag> & "quote"')
  })
})
