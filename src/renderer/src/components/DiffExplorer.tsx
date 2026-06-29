import * as React from 'react'
import { useMemo, useState } from 'react'
import type { DiffFileChange } from '@shared/types'

/** Colourise a unified diff line by its leading character. */
function DiffLine({ line }: { line: string }): React.JSX.Element {
  let cls = 'text-foreground/80'
  if (line.startsWith('+') && !line.startsWith('+++')) cls = 'text-green-600 dark:text-green-400'
  else if (line.startsWith('-') && !line.startsWith('---')) cls = 'text-red-600 dark:text-red-400'
  else if (line.startsWith('@@')) cls = 'text-cyan-600 dark:text-cyan-400'
  return <span className={cls}>{line || ' '}</span>
}

const CAT_DOT: Record<DiffFileChange['category'], string> = {
  source: 'bg-green-500',
  test: 'bg-blue-500',
  config: 'bg-amber-500',
  generated: 'bg-muted-foreground/40',
  other: 'bg-muted-foreground/40'
}

type Node = {
  name: string
  path: string
  isFile: boolean
  file?: DiffFileChange
  children: Map<string, Node>
  add: number
  del: number
  count: number
}

function emptyNode(name: string, path: string): Node {
  return { name, path, isFile: false, children: new Map(), add: 0, del: 0, count: 0 }
}

/** Build a folder/file tree from the flat file list, aggregating counts upward. */
function buildTree(files: DiffFileChange[]): Node {
  const root = emptyNode('', '')
  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean)
    let node = root
    node.add += f.additions
    node.del += f.deletions
    node.count++
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]!
      const isLeaf = i === parts.length - 1
      const path = parts.slice(0, i + 1).join('/')
      let child = node.children.get(name)
      if (!child) {
        child = emptyNode(name, path)
        node.children.set(name, child)
      }
      child.add += f.additions
      child.del += f.deletions
      child.count++
      if (isLeaf) {
        child.isFile = true
        child.file = f
      }
      node = child
    }
  }
  return root
}

/** Collapse single-child folder chains ("a/b/c") into one row for readability. */
function collapseChains(node: Node): Node {
  const children = [...node.children.values()].map(collapseChains)
  // Merge a folder that has exactly one folder child.
  if (!node.isFile && children.length === 1 && !children[0]!.isFile && node.name !== '') {
    const only = children[0]!
    return { ...only, name: `${node.name}/${only.name}` }
  }
  const map = new Map<string, Node>()
  for (const c of children) map.set(c.name, c)
  return { ...node, children: map }
}

function sortedChildren(node: Node): Node[] {
  return [...node.children.values()].sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1 // folders first
    return a.name.localeCompare(b.name)
  })
}

function TreeRows({
  node,
  depth,
  expanded,
  toggle,
  selected,
  onSelect
}: {
  node: Node
  depth: number
  expanded: Set<string>
  toggle: (path: string) => void
  selected: string | null
  onSelect: (f: DiffFileChange) => void
}): React.JSX.Element {
  return (
    <>
      {sortedChildren(node).map((c) => {
        const pad = { paddingLeft: `${depth * 12 + 6}px` }
        if (c.isFile && c.file) {
          const f = c.file
          return (
            <button
              key={c.path}
              onClick={() => onSelect(f)}
              style={pad}
              className={`flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs hover:bg-muted ${
                selected === f.path ? 'bg-muted font-medium' : ''
              }`}
              title={f.path}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${CAT_DOT[f.category]}`} />
              <span className="truncate">{c.name}</span>
              <span className="ml-auto shrink-0 space-x-1 font-mono text-[10px]">
                {f.additions > 0 && (
                  <span className="text-green-600 dark:text-green-400">+{f.additions}</span>
                )}
                {f.deletions > 0 && (
                  <span className="text-red-600 dark:text-red-400">−{f.deletions}</span>
                )}
              </span>
            </button>
          )
        }
        const open = expanded.has(c.path)
        return (
          <React.Fragment key={c.path}>
            <button
              onClick={() => toggle(c.path)}
              style={pad}
              className="flex w-full items-center gap-1 py-1 pr-2 text-left text-xs hover:bg-muted"
              title={c.path}
            >
              <span className="shrink-0 text-muted-foreground">{open ? '▾' : '▸'}</span>
              <span className="shrink-0">📁</span>
              <span className="truncate">{c.name}</span>
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{c.count}</span>
            </button>
            {open && (
              <TreeRows
                node={c}
                depth={depth + 1}
                expanded={expanded}
                toggle={toggle}
                selected={selected}
                onSelect={onSelect}
              />
            )}
          </React.Fragment>
        )
      })}
    </>
  )
}

/**
 * Diff explorer: a file/folder tree of the changes on the left, the selected
 * file's diff on the right — the same Explorer feel as the rest of the app.
 */
export default function DiffExplorer({
  files,
  filesTruncated
}: {
  files: DiffFileChange[]
  filesTruncated: boolean
}): React.JSX.Element {
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<DiffFileChange | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? files.filter((f) => f.path.toLowerCase().includes(q)) : files
  }, [files, filter])

  const tree = useMemo(() => collapseChains(buildTree(shown)), [shown])

  // When filtering, auto-expand every folder so matches are visible.
  const effectiveExpanded = useMemo(() => {
    if (!filter.trim()) return expanded
    const all = new Set<string>()
    const walk = (n: Node): void => {
      for (const c of n.children.values()) {
        if (!c.isFile) {
          all.add(c.path)
          walk(c)
        }
      }
    }
    walk(tree)
    return all
  }, [filter, expanded, tree])

  const toggle = (path: string): void =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const expandAll = (): void => {
    const all = new Set<string>()
    const walk = (n: Node): void => {
      for (const c of n.children.values()) {
        if (!c.isFile) {
          all.add(c.path)
          walk(c)
        }
      }
    }
    walk(tree)
    setExpanded(all)
  }

  if (files.length === 0) {
    return <p className="text-xs text-muted-foreground">Aucun fichier modifié.</p>
  }

  const diffLines = selected?.diff ? selected.diff.split('\n') : []

  return (
    <div className="flex flex-col gap-2">
      {filesTruncated && (
        <p className="text-[11px] text-yellow-600 dark:text-yellow-400">
          ⚠️ Trop de fichiers : seuls les {files.length} premiers sont listés.
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* File tree */}
        <div className="flex min-h-0 flex-col rounded-md border">
          <div className="flex items-center gap-1 border-b p-1.5">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrer les fichiers…"
              spellCheck={false}
              className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-xs"
            />
            <button
              className="shrink-0 rounded bg-muted px-1.5 py-1 text-[11px] hover:bg-muted-foreground/20"
              onClick={expandAll}
              title="Tout déplier"
            >
              ⊞
            </button>
            <button
              className="shrink-0 rounded bg-muted px-1.5 py-1 text-[11px] hover:bg-muted-foreground/20"
              onClick={() => setExpanded(new Set())}
              title="Tout replier"
            >
              ⊟
            </button>
          </div>
          <div className="max-h-96 overflow-auto py-1">
            <TreeRows
              node={tree}
              depth={0}
              expanded={effectiveExpanded}
              toggle={toggle}
              selected={selected?.path ?? null}
              onSelect={setSelected}
            />
            {shown.length === 0 && (
              <p className="p-2 text-xs text-muted-foreground">Aucun fichier ne correspond.</p>
            )}
          </div>
        </div>

        {/* Selected file diff */}
        <div className="flex min-h-0 flex-col rounded-md border">
          {selected ? (
            <>
              <div className="flex items-center gap-2 border-b px-2 py-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${CAT_DOT[selected.category]}`} />
                <code className="min-w-0 flex-1 truncate text-xs" title={selected.path}>
                  {selected.path}
                </code>
                <span className="shrink-0 space-x-1 font-mono text-[10px]">
                  <span className="text-green-600 dark:text-green-400">+{selected.additions}</span>
                  <span className="text-red-600 dark:text-red-400">−{selected.deletions}</span>
                </span>
              </div>
              {diffLines.length > 0 ? (
                <pre className="max-h-96 overflow-auto whitespace-pre p-2 text-[11px] font-mono leading-snug">
                  {diffLines.map((l, i) => (
                    <div key={i}>
                      <DiffLine line={l} />
                    </div>
                  ))}
                  {selected.diffTruncated && (
                    <div className="mt-1 text-muted-foreground">
                      … diff tronqué (fichier volumineux).
                    </div>
                  )}
                </pre>
              ) : (
                <p className="p-3 text-xs text-muted-foreground">
                  Diff non capturé pour ce fichier (trop volumineux). +{selected.additions} / −
                  {selected.deletions} lignes.
                </p>
              )}
            </>
          ) : (
            <p className="p-3 text-xs text-muted-foreground">
              Sélectionnez un fichier dans l&apos;arborescence pour voir son diff.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
