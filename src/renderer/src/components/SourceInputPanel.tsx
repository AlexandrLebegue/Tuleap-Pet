import * as React from 'react'
import { useRef } from 'react'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  Upload, FolderOpen, GitBranch, FileCode, Loader2, AlertCircle, ChevronRight
} from 'lucide-react'
import type { SourceInputMode, GitRepository, GitBranch as GitBranchType } from '@shared/types'

const HEADER_EXTS = ['.h', '.hpp', '.hxx']
const SUPPORTED = [...HEADER_EXTS, '.c', '.cpp', '.cc', '.cxx', '.py']

function isSupported(name: string): boolean {
  return SUPPORTED.some((e) => name.toLowerCase().endsWith(e))
}

type Props = {
  mode: SourceInputMode
  onModeChange: (m: SourceInputMode) => void

  // Mode "fichiers" (drag-drop)
  currentFileName: string | null
  onFileLoaded: (file: { name: string; content: string }) => void

  // Mode "dossier C/C++"
  folderRoot: string | null
  folderFiles: string[]
  folderLoading: boolean
  selectedFolderFile: string | null
  onFolderPick: () => void
  onFolderFileSelect: (rel: string) => void

  // Mode "git" (Tuleap)
  gitRepos: GitRepository[]
  gitLoadingRepos: boolean
  gitSelectedRepo: GitRepository | null
  gitBranches: GitBranchType[]
  gitLoadingBranches: boolean
  gitSelectedBranch: string | null
  gitOnlyRecent: boolean
  gitCloneState: 'idle' | 'cloning' | 'ready' | 'error'
  gitFiles: string[]
  gitError: string | null
  selectedGitFile: string | null
  onGitRepoSelect: (repo: GitRepository) => void
  onGitBranchSelect: (branch: string) => void
  onGitOnlyRecentChange: (v: boolean) => void
  onGitFileSelect: (rel: string) => void
}

const TABS: { id: SourceInputMode; label: string; icon: React.ReactNode }[] = [
  { id: 'files', label: 'Fichiers', icon: <Upload className="size-3.5" /> },
  { id: 'folder', label: 'Dossier C/C++', icon: <FolderOpen className="size-3.5" /> },
  { id: 'git', label: 'Dépôt Git', icon: <GitBranch className="size-3.5" /> }
]

export default function SourceInputPanel(props: Props): React.JSX.Element {
  const {
    mode, onModeChange,
    currentFileName, onFileLoaded,
    folderRoot, folderFiles, folderLoading, selectedFolderFile, onFolderPick, onFolderFileSelect,
    gitRepos, gitLoadingRepos, gitSelectedRepo, gitBranches, gitLoadingBranches,
    gitSelectedBranch, gitOnlyRecent, gitCloneState, gitFiles, gitError, selectedGitFile,
    onGitRepoSelect, onGitBranchSelect, onGitOnlyRecentChange, onGitFileSelect
  } = props

  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)

  const handleFile = React.useCallback(async (file: File) => {
    if (!isSupported(file.name)) return
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file, 'utf-8')
    })
    onFileLoaded({ name: file.name, content: text })
  }, [onFileLoaded])

  const onDrop = React.useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = Array.from(e.dataTransfer.files).find((f) => isSupported(f.name))
    if (file) await handleFile(file)
  }, [handleFile])

  const onFileInput = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) { await handleFile(e.target.files[0]); e.target.value = '' }
  }, [handleFile])

  const fileListClass = 'rounded-md border bg-background max-h-44 overflow-y-auto'
  const fileRowClass = (selected: boolean) =>
    `w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors ${selected ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground'}`

  return (
    <div className="space-y-3">
      {/* Tab selector */}
      <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onModeChange(tab.id)}
            className={[
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              mode === tab.id
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            ].join(' ')}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Mode: fichiers ── */}
      {mode === 'files' && (
        <>
          <Card
            className={`border-2 border-dashed transition-colors cursor-pointer ${dragging ? 'border-primary bg-primary/5' : 'border-border'}`}
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onClick={() => inputRef.current?.click()}
          >
            <CardContent className="flex flex-col items-center justify-center gap-2 py-8">
              <Upload className="size-8 text-muted-foreground" />
              {currentFileName
                ? <p className="text-sm font-medium text-primary">{currentFileName}</p>
                : <p className="text-sm font-medium">Glisser-déposer un fichier source</p>
              }
              <p className="text-xs text-muted-foreground">.c .cpp .h .hpp .cxx .hxx .cc .py</p>
              <Button variant="outline" size="sm" type="button">
                {currentFileName ? 'Changer…' : 'Parcourir…'}
              </Button>
            </CardContent>
          </Card>
          <input
            ref={inputRef}
            type="file"
            accept=".c,.cpp,.cc,.cxx,.h,.hpp,.hxx,.py"
            className="hidden"
            onChange={onFileInput}
          />
        </>
      )}

      {/* ── Mode: dossier C/C++ ── */}
      {mode === 'folder' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <FolderOpen className="size-4 text-muted-foreground shrink-0" />
            <span className="flex-1 min-w-0 truncate text-xs font-mono text-muted-foreground" title={folderRoot ?? ''}>
              {folderRoot ?? 'Aucun dossier sélectionné'}
            </span>
            <Button variant="outline" size="sm" className="h-7 shrink-0" onClick={onFolderPick} disabled={folderLoading}>
              {folderLoading
                ? <Loader2 className="size-3.5 animate-spin" />
                : <><FolderOpen className="size-3.5 mr-1" />{folderRoot ? 'Changer…' : 'Choisir…'}</>
              }
            </Button>
          </div>

          {folderFiles.length > 0 && (
            <div className={fileListClass}>
              {folderFiles.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onFolderFileSelect(f)}
                  className={fileRowClass(selectedFolderFile === f)}
                >
                  <FileCode className="size-3.5 shrink-0" />
                  <span className="truncate font-mono">{f}</span>
                </button>
              ))}
            </div>
          )}

          {folderRoot && !folderLoading && folderFiles.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Aucun fichier source (.c / .cpp) trouvé dans ce dossier.
            </p>
          )}
        </div>
      )}

      {/* ── Mode: dépôt Git (Tuleap) ── */}
      {mode === 'git' && (
        <div className="space-y-2">
          {/* Repos */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Dépôt</p>
            {gitLoadingRepos ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="size-3.5 animate-spin" />Chargement des dépôts…
              </div>
            ) : gitRepos.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">Aucun dépôt trouvé.</p>
            ) : (
              <div className={fileListClass}>
                {gitRepos.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onGitRepoSelect(r)}
                    className={fileRowClass(gitSelectedRepo?.id === r.id)}
                  >
                    <GitBranch className="size-3.5 shrink-0" />
                    <span className="truncate flex-1">{r.name}</span>
                    {gitSelectedRepo?.id === r.id && <ChevronRight className="size-3.5 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Branches */}
          {gitSelectedRepo && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
                Branche — <span className="text-foreground normal-case">{gitSelectedRepo.name}</span>
              </p>
              {gitLoadingBranches ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="size-3.5 animate-spin" />Chargement des branches…
                </div>
              ) : (
                <div className={fileListClass} style={{ maxHeight: '6rem' }}>
                  {gitBranches.map((b) => (
                    <button
                      key={b.name}
                      type="button"
                      onClick={() => onGitBranchSelect(b.name)}
                      className={fileRowClass(gitSelectedBranch === b.name)}
                    >
                      <GitBranch className="size-3.5 shrink-0" />
                      <span className="truncate font-mono">{b.name}</span>
                      {gitSelectedBranch === b.name && <ChevronRight className="size-3.5 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Options + cloning indicator */}
          {gitSelectedBranch && (
            <div className="flex items-center gap-3 pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs">
                <input
                  type="checkbox"
                  checked={gitOnlyRecent}
                  onChange={(e) => onGitOnlyRecentChange(e.target.checked)}
                  className="rounded"
                />
                <span>Fichiers récents seulement</span>
                <span className="text-muted-foreground">(HEAD diff)</span>
              </label>
              {gitCloneState === 'cloning' && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
                  <Loader2 className="size-3.5 animate-spin" />Clonage…
                </span>
              )}
            </div>
          )}

          {gitError && (
            <div className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
              <span>{gitError}</span>
            </div>
          )}

          {gitFiles.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fichier</p>
                <Badge variant="outline" className="text-[10px]">{gitFiles.length} fichier(s)</Badge>
              </div>
              <div className={fileListClass}>
                {gitFiles.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => onGitFileSelect(f)}
                    className={fileRowClass(selectedGitFile === f)}
                  >
                    <FileCode className="size-3.5 shrink-0" />
                    <span className="truncate font-mono">{f}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {gitCloneState === 'ready' && gitFiles.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Aucun fichier source (.c / .cpp) trouvé dans cette branche.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
