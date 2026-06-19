import * as React from 'react'
import { useMemo, useRef, useEffect } from 'react'

type Props = {
  files: string[]
  changedFiles: string[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  disabled?: boolean
}

/**
 * Sélecteur de fichiers pour un job (commentateur / tests) :
 * barre de recherche, liste à cases à cocher, et case maître « tout cocher / décocher ».
 */
export default function JobFilePicker({
  files,
  changedFiles,
  selected,
  onChange,
  disabled = false
}: Props): React.JSX.Element {
  const [query, setQuery] = React.useState('')
  const masterRef = useRef<HTMLInputElement>(null)

  const changedSet = useMemo(() => new Set(changedFiles), [changedFiles])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return files
    return files.filter((f) => f.toLowerCase().includes(q))
  }, [files, query])

  const selectedVisibleCount = filtered.filter((f) => selected.has(f)).length
  const allVisibleSelected = filtered.length > 0 && selectedVisibleCount === filtered.length
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected

  // État indéterminé de la case maître (sélection partielle des fichiers visibles).
  useEffect(() => {
    if (masterRef.current) masterRef.current.indeterminate = someVisibleSelected
  }, [someVisibleSelected])

  const toggleFile = (file: string): void => {
    const next = new Set(selected)
    if (next.has(file)) next.delete(file)
    else next.add(file)
    onChange(next)
  }

  // « Tout cocher / décocher » s'applique aux fichiers actuellement visibles (filtrés).
  const toggleAllVisible = (): void => {
    const next = new Set(selected)
    if (allVisibleSelected) {
      for (const f of filtered) next.delete(f)
    } else {
      for (const f of filtered) next.add(f)
    }
    onChange(next)
  }

  const selectChangedOnly = (): void => {
    onChange(new Set(changedFiles))
  }

  return (
    <div className="border rounded-md flex flex-col min-h-0">
      {/* Recherche */}
      <div className="p-2 border-b">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un fichier…"
          spellCheck={false}
          disabled={disabled}
          className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* Case maître + raccourcis */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b bg-muted/30">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            ref={masterRef}
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleAllVisible}
            disabled={disabled || filtered.length === 0}
            className="h-4 w-4 accent-primary"
          />
          <span className="text-xs font-medium">
            {allVisibleSelected ? 'Tout décocher' : 'Tout cocher'}
            {query.trim() ? ' (filtrés)' : ''}
          </span>
        </label>
        {changedFiles.length > 0 && (
          <button
            type="button"
            onClick={selectChangedOnly}
            disabled={disabled}
            className="text-xs text-primary hover:underline disabled:opacity-40"
          >
            Fichiers modifiés ({changedFiles.length})
          </button>
        )}
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto max-h-64">
        {filtered.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">Aucun fichier.</p>
        ) : (
          filtered.map((f) => (
            <label
              key={f}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer select-none border-b last:border-0"
            >
              <input
                type="checkbox"
                checked={selected.has(f)}
                onChange={() => toggleFile(f)}
                disabled={disabled}
                className="h-4 w-4 accent-primary shrink-0"
              />
              <span className="text-xs font-mono truncate" title={f}>
                {f}
              </span>
              {changedSet.has(f) && (
                <span className="ml-auto shrink-0 text-[10px] px-1 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">
                  modifié
                </span>
              )}
            </label>
          ))
        )}
      </div>

      {/* Compteur */}
      <div className="px-3 py-1.5 border-t text-xs text-muted-foreground">
        {selected.size} / {files.length} fichier(s) sélectionné(s)
      </div>
    </div>
  )
}
