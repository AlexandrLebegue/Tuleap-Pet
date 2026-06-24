import { describe, it, expect } from 'vitest'
import { parseUnifiedDiffStats, truncateDiff } from '../../src/main/compare/diff-utils'

const GIT_DIFF = `diff --git a/src/foo.c b/src/foo.c
index 111..222 100644
--- a/src/foo.c
+++ b/src/foo.c
@@ -1,3 +1,4 @@
 int add(int a, int b) {
+  // new comment
   return a + b;
-  // old
 }
diff --git a/src/bar.h b/src/bar.h
--- a/src/bar.h
+++ b/src/bar.h
@@ -0,0 +1,2 @@
+int sub(int, int);
+int mul(int, int);
`

const SVN_DIFF = `Index: trunk/foo.c
===================================================================
--- trunk/foo.c\t(.../trunk)\t(revision 3)
+++ trunk/foo.c\t(.../branches/x)\t(revision 7)
@@ -1,2 +1,3 @@
 int add(int a,int b){return a+b;}
+int sub(int a,int b){return a-b;}
`

describe('parseUnifiedDiffStats', () => {
  it('counts git files, additions and deletions (ignoring +++/--- markers)', () => {
    const s = parseUnifiedDiffStats(GIT_DIFF)
    expect(s.files).toBe(2)
    expect(s.filesChanged).toEqual(['src/foo.c', 'src/bar.h'])
    expect(s.additions).toBe(3) // "// new comment", "int sub", "int mul"
    expect(s.deletions).toBe(1) // "// old"
  })

  it('counts svn (Index:) files and content lines', () => {
    const s = parseUnifiedDiffStats(SVN_DIFF)
    expect(s.files).toBe(1)
    expect(s.filesChanged).toEqual(['trunk/foo.c'])
    expect(s.additions).toBe(1)
    expect(s.deletions).toBe(0)
  })

  it('returns zeroes for an empty diff', () => {
    expect(parseUnifiedDiffStats('')).toEqual({
      files: 0,
      additions: 0,
      deletions: 0,
      filesChanged: []
    })
  })
})

describe('truncateDiff', () => {
  it('does not truncate when under the budget', () => {
    expect(truncateDiff('abc', 10)).toEqual({ text: 'abc', truncated: false })
  })

  it('truncates on a line boundary and flags it', () => {
    const text = 'line1\nline2\nline3\n'
    const r = truncateDiff(text, 8)
    expect(r.truncated).toBe(true)
    expect(r.text).toBe('line1')
    expect(text.startsWith(r.text)).toBe(true)
  })
})
