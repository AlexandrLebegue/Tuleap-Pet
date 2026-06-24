import * as React from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@renderer/lib/api'
import { useSettings } from '@renderer/stores/settings.store'
import { Button } from '@renderer/components/ui/button'
import HeaderFunctionSelector, { fnKey } from '@renderer/components/HeaderFunctionSelector'
import CompareResultView from '@renderer/components/CompareResultView'
import type {
  GitRepository,
  GitBranch,
  GitCommit,
  HeaderEntry,
  CommentTarget,
  JenkinsBranchStatus,
  JenkinsBuildResult,
  BranchCompareResult,
  Page
} from '@shared/types'

/** Keep only C headers (.h) and functions implemented in .c/.h (C only). */
function filterCHeaders(headers: HeaderEntry[]): HeaderEntry[] {
  return headers
    .filter((h) => h.headerPath.toLowerCase().endsWith('.h'))
    .map((h) => ({
      ...h,
      functions: h.functions.filter(
        (f) => f.implFile.toLowerCase().endsWith('.c') || f.implFile.toLowerCase().endsWith('.h')
      )
    }))
    .filter((h) => h.functions.length > 0)
}

function jenkinsBadge(status: JenkinsBranchStatus | null | undefined): React.JSX.Element | null {
  if (!status) return null
  if (status.building) {
    return (
      <span title="Build en cours" className="text-xs px-1 rounded bg-yellow-100 text-yellow-700">
        ⟳
      </span>
    )
  }
  const result: JenkinsBuildResult = status.result
  if (result === 'SUCCESS') {
    return (
      <span title="Build OK" className="text-xs px-1 rounded bg-green-100 text-green-700">
        ✓
      </span>
    )
  }
  if (result === 'FAILURE') {
    return (
      <span title="Build échoué" className="text-xs px-1 rounded bg-red-100 text-red-700">
        ✗
      </span>
    )
  }
  if (result === 'UNSTABLE') {
    return (
      <span title="Build instable" className="text-xs px-1 rounded bg-yellow-100 text-yellow-700">
        !
      </span>
    )
  }
  return null
}

// Commenter modal: clone async → pick functions (header-driven, C only) → run.
type CmStage = 'cloning' | 'selecting' | 'starting' | 'error'

type CmModal = {
  repo: GitRepository
  branch: string
  cloneUrl: string
  stage: CmStage
  cloneDir: string | null
  headers: HeaderEntry[]
  selected: Set<string>
  /** Generate the Doxygen brief above the declaration in the .h. */
  commentHeader: boolean
  /** Add inline comments inside the function body in the .c. */
  commentBody: boolean
  depth: number
  error: string | null
}

// Test-generator modal: clone async → pick functions (header-driven) → run.
type TgStage = 'cloning' | 'selecting' | 'starting' | 'error'

type TgModal = {
  repo: GitRepository
  branch: string
  cloneUrl: string
  stage: TgStage
  cloneDir: string | null
  headers: HeaderEntry[]
  selected: Set<string>
  error: string | null
}

// Default ai_compil.bat template offered when the clone ships no compile script.
const DEFAULT_AI_COMPIL_TEMPLATE = `@echo off
rem ai_compil.bat — Compile le projet et collecte les warnings dans warning.txt
rem (place A COTE de ce script). Adaptez le preset / le compilateur a votre projet.
rem Format attendu : MSVC "fichier(ligne): warning Cxxxx: msg" ou GCC/Clang.
setlocal
cd /d "%~dp0"

rem Build via le workflow CMake MSVC, garde les lignes de warning et nettoie le
rem prefixe MSBuild "NN>" avant d'ecrire warning.txt.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "cmake --workflow --preset ci-msvc 2>&1 | Select-String ': warning ' | ForEach-Object { ($_.Line -replace '^\\s*\\d+>','').Trim() } | Set-Content -Encoding utf8 'warning.txt'"

endlocal
exit /b 0
`

// Warning-corrector modal: clone async → pick functions → set retry budget → run.
type WcStage = 'cloning' | 'selecting' | 'starting' | 'error'

type WcModal = {
  repo: GitRepository
  branch: string
  cloneUrl: string
  stage: WcStage
  cloneDir: string | null
  headers: HeaderEntry[]
  selected: Set<string>
  /** Recompile→correct retries allowed after the first pass. */
  maxRetries: number
  /** null = detection en cours ; true/false = présence d'un script ai_compil. */
  scriptFound: boolean | null
  /** Editable ai_compil content used when no script was detected. */
  scriptTemplate: string
  error: string | null
}

export default function GitExplorer(): React.JSX.Element {
  const config = useSettings((s) => s.config)
  const [repos, setRepos] = useState<GitRepository[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [reposError, setReposError] = useState<string | null>(null)

  const [selectedRepo, setSelectedRepo] = useState<GitRepository | null>(null)
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [jenkinsBuildStatuses, setJenkinsBuildStatuses] = useState<
    Record<string, JenkinsBranchStatus | null>
  >({})

  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const [commitsPage, setCommitsPage] = useState<Page<GitCommit> | null>(null)
  const [commitsOffset, setCommitsOffset] = useState(0)
  const [loadingCommits, setLoadingCommits] = useState(false)

  // Commenter modal
  const [cm, setCm] = useState<CmModal | null>(null)
  const cmCloneDirRef = useRef<string | null>(null)
  const cmStartedRef = useRef(false)

  // Test-generator modal
  const [tg, setTg] = useState<TgModal | null>(null)
  const tgCloneDirRef = useRef<string | null>(null)
  const tgStartedRef = useRef(false)

  // Warning-corrector modal
  const [wc, setWc] = useState<WcModal | null>(null)
  const wcCloneDirRef = useRef<string | null>(null)
  const wcStartedRef = useRef(false)

  // Release Notes modal
  const [rnModal, setRnModal] = useState<{ repoId: number; cloneUrl: string } | null>(null)
  const [rnTags, setRnTags] = useState<string[]>([])
  const [rnFrom, setRnFrom] = useState('')
  const [rnTo, setRnTo] = useState('')
  const [rnLoading, setRnLoading] = useState(false)
  const [rnResult, setRnResult] = useState<string | null>(null)
  const [rnError, setRnError] = useState<string | null>(null)

  // Compare modal
  const [cmp, setCmp] = useState<{
    compare: string
    base: string
    stage: 'select' | 'loading' | 'result' | 'error'
    result: BranchCompareResult | null
    error: string | null
  } | null>(null)

  useEffect(() => {
    if (!selectedRepo || branches.length === 0) return
    if (!config.jenkinsUrl || !config.hasJenkinsToken) return
    const jobName = selectedRepo.name
    let cancelled = false
    void (async () => {
      const statuses: Record<string, JenkinsBranchStatus | null> = {}
      await Promise.all(
        branches.map(async (b) => {
          try {
            statuses[b.name] = await api.jenkins.getBranchStatus({ jobName, branchName: b.name })
          } catch {
            statuses[b.name] = null
          }
        })
      )
      if (!cancelled) setJenkinsBuildStatuses(statuses)
    })()
    return () => {
      cancelled = true
    }
  }, [selectedRepo, branches, config.jenkinsUrl, config.hasJenkinsToken])

  const noTempPath = !config.tempClonePath

  useEffect(() => {
    setLoadingRepos(true)
    setReposError(null)
    api.gitExplorer
      .listRepos()
      .then(setRepos)
      .catch((e: unknown) => setReposError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingRepos(false))
  }, [])

  const selectRepo = useCallback((repo: GitRepository) => {
    setSelectedRepo(repo)
    setSelectedBranch(null)
    setCommitsPage(null)
    setCommitsOffset(0)
    setBranches([])
    setJenkinsBuildStatuses({})
    setLoadingBranches(true)
    api.gitExplorer
      .listBranches(repo.id)
      .then(setBranches)
      .catch(() => setBranches([]))
      .finally(() => setLoadingBranches(false))
  }, [])

  const selectBranch = useCallback(
    (branch: string, offset = 0) => {
      if (!selectedRepo) return
      setSelectedBranch(branch)
      setCommitsOffset(offset)
      setLoadingCommits(true)
      api.gitExplorer
        .listCommits({ repoId: selectedRepo.id, branchName: branch, offset })
        .then(setCommitsPage)
        .catch(() => setCommitsPage(null))
        .finally(() => setLoadingCommits(false))
    },
    [selectedRepo]
  )

  // ─── Commenter: clone async, then pick header functions (C only) ────────────
  const openCommenter = useCallback(
    async (branch: string) => {
      if (!selectedRepo) return
      const repo = selectedRepo
      cmStartedRef.current = false
      cmCloneDirRef.current = null
      setCm({
        repo,
        branch,
        cloneUrl: repo.cloneUrl,
        stage: 'cloning',
        cloneDir: null,
        headers: [],
        selected: new Set(),
        commentHeader: true,
        commentBody: false,
        depth: 3,
        error: null
      })
      const clone = await api.testgen.gitCloneAndList({
        repoUrl: repo.cloneUrl,
        branch,
        onlyRecentFiles: false
      })
      if (!clone.ok) {
        setCm((prev) => (prev ? { ...prev, stage: 'error', error: clone.error } : prev))
        return
      }
      cmCloneDirRef.current = clone.cloneDir
      const idx = await api.testgen.buildHeaderIndex({ cloneDir: clone.cloneDir })
      if (!idx.ok) {
        setCm((prev) => (prev ? { ...prev, stage: 'error', error: idx.error } : prev))
        return
      }
      setCm((prev) =>
        prev
          ? {
              ...prev,
              stage: 'selecting',
              cloneDir: idx.cloneDir,
              headers: filterCHeaders(idx.headers)
            }
          : prev
      )
    },
    [selectedRepo]
  )

  const closeCommenter = useCallback(() => {
    if (!cmStartedRef.current && cmCloneDirRef.current) {
      void api.testgen.cleanupCloneDir({ cloneDir: cmCloneDirRef.current })
    }
    cmCloneDirRef.current = null
    setCm(null)
  }, [])

  const startCommenter = useCallback(async () => {
    if (!cm || !cm.cloneDir) return
    if (!cm.commentHeader && !cm.commentBody) return
    const targets: CommentTarget[] = []
    for (const h of cm.headers) {
      for (const f of h.functions) {
        if (cm.selected.has(fnKey(f))) {
          targets.push({
            headerPath: h.headerPath,
            name: f.name,
            implFile: f.implFile,
            implLine: f.implLine,
            inHeader: f.inHeader
          })
        }
      }
    }
    if (targets.length === 0) return
    setCm((prev) => (prev ? { ...prev, stage: 'starting' } : prev))
    cmStartedRef.current = true
    await api.gitExplorer.startJob({
      repoId: cm.repo.id,
      repoName: cm.repo.name,
      cloneUrl: cm.cloneUrl,
      branchName: cm.branch,
      type: 'commentateur',
      options: {
        preserveExisting: true,
        addFileHeader: false,
        detailedComments: false,
        applyCodingRules: false,
        onlyChangedFiles: false,
        commentHeader: cm.commentHeader,
        commentBody: cm.commentBody,
        contextDepth: cm.depth
      },
      commentTargets: targets,
      existingCloneDir: cm.cloneDir
    })
    cmCloneDirRef.current = null
    setCm(null)
  }, [cm])

  // ─── Test-generator: clone async, then pick header functions ────────────────
  const openTestGen = useCallback(
    async (branch: string) => {
      if (!selectedRepo) return
      const repo = selectedRepo
      tgStartedRef.current = false
      tgCloneDirRef.current = null
      setTg({
        repo,
        branch,
        cloneUrl: repo.cloneUrl,
        stage: 'cloning',
        cloneDir: null,
        headers: [],
        selected: new Set(),
        error: null
      })
      const clone = await api.testgen.gitCloneAndList({
        repoUrl: repo.cloneUrl,
        branch,
        onlyRecentFiles: false
      })
      if (!clone.ok) {
        setTg((prev) => (prev ? { ...prev, stage: 'error', error: clone.error } : prev))
        return
      }
      tgCloneDirRef.current = clone.cloneDir
      const idx = await api.testgen.buildHeaderIndex({ cloneDir: clone.cloneDir })
      if (!idx.ok) {
        setTg((prev) => (prev ? { ...prev, stage: 'error', error: idx.error } : prev))
        return
      }
      setTg((prev) =>
        prev ? { ...prev, stage: 'selecting', cloneDir: idx.cloneDir, headers: idx.headers } : prev
      )
    },
    [selectedRepo]
  )

  const closeTg = useCallback(() => {
    if (!tgStartedRef.current && tgCloneDirRef.current) {
      void api.testgen.cleanupCloneDir({ cloneDir: tgCloneDirRef.current })
    }
    tgCloneDirRef.current = null
    setTg(null)
  }, [])

  const startTestGen = useCallback(async () => {
    if (!tg || !tg.cloneDir) return
    const byFile = new Map<string, string[]>()
    for (const h of tg.headers) {
      for (const f of h.functions) {
        if (tg.selected.has(fnKey(f))) {
          const arr = byFile.get(f.implFile) ?? []
          arr.push(f.name)
          byFile.set(f.implFile, arr)
        }
      }
    }
    const selection = [...byFile.entries()].map(([sourceFile, functions]) => ({
      sourceFile,
      functions
    }))
    if (selection.length === 0) return
    setTg((prev) => (prev ? { ...prev, stage: 'starting' } : prev))
    tgStartedRef.current = true
    await api.gitExplorer.startJob({
      repoId: tg.repo.id,
      repoName: tg.repo.name,
      cloneUrl: tg.cloneUrl,
      branchName: tg.branch,
      type: 'test-generator',
      selection,
      existingCloneDir: tg.cloneDir
    })
    tgCloneDirRef.current = null
    setTg(null)
  }, [tg])

  // ─── Warning-corrector: clone async, then pick header functions ─────────────
  const openWarningCorrector = useCallback(
    async (branch: string) => {
      if (!selectedRepo) return
      const repo = selectedRepo
      wcStartedRef.current = false
      wcCloneDirRef.current = null
      setWc({
        repo,
        branch,
        cloneUrl: repo.cloneUrl,
        stage: 'cloning',
        cloneDir: null,
        headers: [],
        selected: new Set(),
        maxRetries: 2,
        scriptFound: null,
        scriptTemplate: DEFAULT_AI_COMPIL_TEMPLATE,
        error: null
      })
      const clone = await api.testgen.gitCloneAndList({
        repoUrl: repo.cloneUrl,
        branch,
        onlyRecentFiles: false
      })
      if (!clone.ok) {
        setWc((prev) => (prev ? { ...prev, stage: 'error', error: clone.error } : prev))
        return
      }
      wcCloneDirRef.current = clone.cloneDir
      const idx = await api.testgen.buildHeaderIndex({ cloneDir: clone.cloneDir })
      if (!idx.ok) {
        setWc((prev) => (prev ? { ...prev, stage: 'error', error: idx.error } : prev))
        return
      }
      // Detect whether the repo ships an ai_compil script; if not, the modal will
      // prompt for one (editable template) before the job can run.
      const detect = await api.gitExplorer
        .detectCompileScript({ cloneDir: idx.cloneDir })
        .catch(() => ({ found: false, scripts: [] as string[] }))
      setWc((prev) =>
        prev
          ? {
              ...prev,
              stage: 'selecting',
              cloneDir: idx.cloneDir,
              headers: idx.headers,
              scriptFound: detect.found
            }
          : prev
      )
    },
    [selectedRepo]
  )

  const closeWc = useCallback(() => {
    if (!wcStartedRef.current && wcCloneDirRef.current) {
      void api.testgen.cleanupCloneDir({ cloneDir: wcCloneDirRef.current })
    }
    wcCloneDirRef.current = null
    setWc(null)
  }, [])

  const startWarningCorrector = useCallback(async () => {
    if (!wc || !wc.cloneDir) return
    const byFile = new Map<string, string[]>()
    for (const h of wc.headers) {
      for (const f of h.functions) {
        if (wc.selected.has(fnKey(f))) {
          const arr = byFile.get(f.implFile) ?? []
          arr.push(f.name)
          byFile.set(f.implFile, arr)
        }
      }
    }
    const selection = [...byFile.entries()].map(([sourceFile, functions]) => ({
      sourceFile,
      functions
    }))
    if (selection.length === 0) return
    // No ai_compil in the repo → write the user-provided template into the clone first.
    if (wc.scriptFound === false) {
      if (wc.scriptTemplate.trim().length === 0) return
      const res = await api.gitExplorer.writeCompileScript({
        cloneDir: wc.cloneDir,
        filename: 'ai_compil.bat',
        content: wc.scriptTemplate
      })
      if (!res.ok) {
        setWc((prev) => (prev ? { ...prev, stage: 'error', error: res.error } : prev))
        return
      }
    }
    setWc((prev) => (prev ? { ...prev, stage: 'starting' } : prev))
    wcStartedRef.current = true
    await api.gitExplorer.startJob({
      repoId: wc.repo.id,
      repoName: wc.repo.name,
      cloneUrl: wc.cloneUrl,
      branchName: wc.branch,
      type: 'warning-corrector',
      selection,
      warningOptions: { maxRetries: wc.maxRetries },
      existingCloneDir: wc.cloneDir
    })
    wcCloneDirRef.current = null
    setWc(null)
  }, [wc])

  // ─── Release Notes ──────────────────────────────────────────────────────────
  const openRnModal = useCallback(async () => {
    if (!selectedRepo) return
    setRnModal({ repoId: selectedRepo.id, cloneUrl: selectedRepo.cloneUrl })
    setRnResult(null)
    setRnError(null)
    setRnFrom('')
    setRnTo('')
    setRnLoading(true)
    const tags = await window.api.releaseNotes
      .listRemoteTags({ repoId: selectedRepo.id, cloneUrl: selectedRepo.cloneUrl })
      .catch(() => [] as string[])
    setRnTags(tags)
    if (tags.length >= 2) {
      setRnFrom(tags[1]!)
      setRnTo(tags[0]!)
    } else if (tags.length === 1) {
      setRnFrom(tags[0]!)
      setRnTo('HEAD')
    }
    setRnLoading(false)
  }, [selectedRepo])

  async function generateReleaseNotes(): Promise<void> {
    if (!rnModal || !rnFrom || !rnTo) return
    setRnLoading(true)
    setRnResult(null)
    setRnError(null)
    try {
      const r = await window.api.releaseNotes.generate({
        repoId: rnModal.repoId,
        cloneUrl: rnModal.cloneUrl,
        fromRef: rnFrom,
        toRef: rnTo
      })
      if (r.ok) setRnResult(r.markdown)
      else setRnError(r.error)
    } catch (e) {
      setRnError(e instanceof Error ? e.message : String(e))
    } finally {
      setRnLoading(false)
    }
  }

  // ─── Compare branches ────────────────────────────────────────────────────────
  const openCompare = useCallback(
    (branch: string) => {
      const others = branches.map((b) => b.name).filter((n) => n !== branch)
      const preferred = ['main', 'master', 'develop', 'trunk'].find((n) => others.includes(n))
      setCmp({
        compare: branch,
        base: preferred ?? others[0] ?? branch,
        stage: 'select',
        result: null,
        error: null
      })
    },
    [branches]
  )

  const runCompare = useCallback(async () => {
    if (!selectedRepo || !cmp) return
    if (cmp.base === cmp.compare) {
      setCmp((p) =>
        p ? { ...p, stage: 'error', error: 'Choisissez deux branches différentes.' } : p
      )
      return
    }
    setCmp((p) => (p ? { ...p, stage: 'loading', error: null } : p))
    const res = await api.gitExplorer.compareBranches({
      repoName: selectedRepo.name,
      cloneUrl: selectedRepo.cloneUrl,
      base: cmp.base,
      compare: cmp.compare
    })
    if (res.ok) setCmp((p) => (p ? { ...p, stage: 'result', result: res.result } : p))
    else setCmp((p) => (p ? { ...p, stage: 'error', error: res.error } : p))
  }, [selectedRepo, cmp])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Git Explorer</h1>
        {noTempPath && (
          <p className="mt-1 text-sm text-yellow-600 dark:text-yellow-400">
            Configurez un dossier temporaire dans Réglages pour lancer des jobs.
          </p>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden divide-x">
        {/* Repos */}
        <div className="w-56 flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b">
            Dépôts
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingRepos && <p className="p-3 text-xs text-muted-foreground">Chargement…</p>}
            {reposError && <p className="p-3 text-xs text-destructive">{reposError}</p>}
            {!loadingRepos && !reposError && repos.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">Aucun dépôt.</p>
            )}
            {repos.map((r) => (
              <button
                key={r.id}
                onClick={() => selectRepo(r)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors truncate ${
                  selectedRepo?.id === r.id ? 'bg-muted font-medium' : ''
                }`}
                title={r.description || r.name}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>

        {/* Branches */}
        <div className="w-64 flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b">
            Branches
          </div>
          <div className="flex-1 overflow-y-auto">
            {!selectedRepo && (
              <p className="p-3 text-xs text-muted-foreground">Sélectionnez un dépôt.</p>
            )}
            {selectedRepo && loadingBranches && (
              <p className="p-3 text-xs text-muted-foreground">Chargement…</p>
            )}
            {selectedRepo && !loadingBranches && branches.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">Aucune branche.</p>
            )}
            {branches.map((b) => (
              <div
                key={b.name}
                className={`flex items-center justify-between px-3 py-2 hover:bg-muted transition-colors ${
                  selectedBranch === b.name ? 'bg-muted' : ''
                }`}
              >
                <button
                  onClick={() => selectBranch(b.name, 0)}
                  className="flex-1 text-left text-sm truncate min-w-0 mr-1 flex items-center gap-1"
                  title={b.name}
                >
                  <span className="truncate">{b.name}</span>
                  {jenkinsBadge(jenkinsBuildStatuses[b.name])}
                </button>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => void openCommenter(b.name)}
                    disabled={noTempPath}
                    className="text-xs px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Lancer le commentateur"
                  >
                    💬
                  </button>
                  <button
                    onClick={() => void openTestGen(b.name)}
                    disabled={noTempPath}
                    className="text-xs px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Générer des tests"
                  >
                    🧪
                  </button>
                  <button
                    onClick={() => void openWarningCorrector(b.name)}
                    disabled={noTempPath}
                    className="text-xs px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Corriger les warnings"
                  >
                    ⚠️
                  </button>
                  <button
                    onClick={() => void openRnModal()}
                    disabled={noTempPath}
                    className="text-xs px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Générer des release notes"
                  >
                    📋
                  </button>
                  <button
                    onClick={() => openCompare(b.name)}
                    disabled={noTempPath}
                    className="text-xs px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Comparer à une autre branche"
                  >
                    🔀
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Commits */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b flex items-center justify-between">
            <span>Commits{selectedBranch ? ` — ${selectedBranch}` : ''}</span>
            {commitsPage && (
              <span className="font-normal normal-case">
                {commitsPage.offset + 1}–
                {Math.min(commitsPage.offset + commitsPage.limit, commitsPage.total)} /{' '}
                {commitsPage.total}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {!selectedBranch && (
              <p className="p-3 text-xs text-muted-foreground">Sélectionnez une branche.</p>
            )}
            {selectedBranch && loadingCommits && (
              <p className="p-3 text-xs text-muted-foreground">Chargement…</p>
            )}
            {selectedBranch && !loadingCommits && commitsPage && commitsPage.items.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">Aucun commit.</p>
            )}
            {selectedBranch && !loadingCommits && commitsPage && commitsPage.items.length > 0 && (
              <p className="px-3 py-2 text-[11px] text-muted-foreground border-b bg-muted/30">
                L&apos;API REST Tuleap n&apos;expose que le commit de tête de la branche. Pour
                parcourir l&apos;historique complet, lance un job (Commenter / Tests / etc.) qui
                clone le repo.
              </p>
            )}
            {commitsPage?.items.map((c) => (
              <div key={c.id} className="px-3 py-2 border-b last:border-0 hover:bg-muted/50">
                <div className="flex items-start gap-2">
                  <code className="text-xs text-muted-foreground font-mono shrink-0 mt-0.5">
                    {c.shortId}
                  </code>
                  <div className="min-w-0">
                    <p className="text-sm truncate">{c.title || '(sans message)'}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.authorName}
                      {c.authoredDate && ` · ${new Date(c.authoredDate).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {commitsPage && commitsPage.total > commitsPage.limit && (
            <div className="border-t px-3 py-2 flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={commitsOffset === 0 || loadingCommits}
                onClick={() => selectBranch(selectedBranch!, Math.max(0, commitsOffset - 30))}
              >
                ← Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  commitsPage.offset + commitsPage.limit >= commitsPage.total || loadingCommits
                }
                onClick={() => selectBranch(selectedBranch!, commitsOffset + 30)}
              >
                Suivant →
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Release Notes modal */}
      {rnModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg border shadow-xl w-full max-w-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold">📋 Release Notes</h2>
            <p className="text-sm text-muted-foreground">
              Le dépôt sera cloné automatiquement dans votre dossier temporaire.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Tag / Ref — depuis
                </label>
                {rnLoading && rnTags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Récupération des tags…</p>
                ) : (
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                    value={rnFrom}
                    onChange={(e) => setRnFrom(e.target.value)}
                  >
                    <option value="">— choisir —</option>
                    {rnTags.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Tag / Ref — jusqu&apos;à
                </label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  value={rnTo}
                  onChange={(e) => setRnTo(e.target.value)}
                >
                  <option value="HEAD">HEAD (branche courante)</option>
                  {rnTags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {rnError && <p className="text-sm text-destructive">{rnError}</p>}
            {rnResult && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Résultat
                  </p>
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => navigator.clipboard.writeText(rnResult)}
                  >
                    Copier
                  </button>
                </div>
                <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                  {rnResult}
                </pre>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRnModal(null)
                  setRnResult(null)
                  setRnError(null)
                }}
                disabled={rnLoading}
              >
                Fermer
              </Button>
              <Button
                onClick={() => void generateReleaseNotes()}
                disabled={rnLoading || !rnFrom || !rnTo}
              >
                {rnLoading ? 'Génération…' : 'Générer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Compare branches modal */}
      {cmp && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg border shadow-xl w-full max-w-3xl p-6 flex flex-col gap-4 max-h-[88vh]">
            <div>
              <h2 className="text-lg font-semibold">🔀 Comparer des branches</h2>
              <p className="text-sm text-muted-foreground">
                {selectedRepo?.name} — différences et nouvelles fonctionnalités de{' '}
                <code className="text-xs">{cmp.compare}</code>
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 px-3 py-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Branche de base
                <select
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                  value={cmp.base}
                  onChange={(e) => setCmp((p) => (p ? { ...p, base: e.target.value } : p))}
                  disabled={cmp.stage === 'loading'}
                >
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <span className="pb-1.5 text-muted-foreground">→</span>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Branche à comparer
                <select
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                  value={cmp.compare}
                  onChange={(e) => setCmp((p) => (p ? { ...p, compare: e.target.value } : p))}
                  disabled={cmp.stage === 'loading'}
                >
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                className="ml-auto"
                onClick={() => void runCompare()}
                disabled={cmp.stage === 'loading' || cmp.base === cmp.compare}
              >
                {cmp.stage === 'loading' ? 'Comparaison…' : 'Comparer'}
              </Button>
            </div>

            {cmp.stage === 'loading' && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Clonage, calcul du diff et synthèse IA en cours…
              </p>
            )}
            {cmp.stage === 'error' && (
              <p className="text-sm text-destructive whitespace-pre-wrap">{cmp.error}</p>
            )}
            {cmp.stage === 'result' && cmp.result && <CompareResultView result={cmp.result} />}

            <div className="flex justify-end gap-2 border-t pt-2">
              <Button
                variant="outline"
                onClick={() => setCmp(null)}
                disabled={cmp.stage === 'loading'}
              >
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Commenter: clone + header/function selection modal (C only) */}
      {cm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg border shadow-xl w-full max-w-2xl p-6 flex flex-col gap-4 max-h-[85vh]">
            <div>
              <h2 className="text-lg font-semibold">💬 Lancer le commentateur</h2>
              <p className="text-sm text-muted-foreground">
                {cm.repo.name} · branche <code className="text-xs">{cm.branch}</code>
              </p>
            </div>

            {cm.stage === 'cloning' && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Clonage et analyse du dépôt en cours…
              </p>
            )}

            {cm.stage === 'error' && (
              <p className="text-sm text-destructive">{cm.error ?? 'Erreur inconnue.'}</p>
            )}

            {(cm.stage === 'selecting' || cm.stage === 'starting') && (
              <>
                <p className="text-xs text-muted-foreground">
                  Sélectionnez les fonctions à commenter (headers C uniquement). Le brief Doxygen
                  est écrit dans le <code className="text-[11px]">.h</code> au-dessus de la fonction
                  ; les commentaires de code sont ajoutés dans le corps de la fonction.
                </p>

                <div className="flex flex-wrap gap-4 rounded-md border bg-muted/30 px-3 py-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={cm.commentHeader}
                      onChange={() =>
                        setCm((prev) =>
                          prev ? { ...prev, commentHeader: !prev.commentHeader } : prev
                        )
                      }
                      className="h-4 w-4 accent-primary"
                    />
                    Commenter le header (brief dans le .h)
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={cm.commentBody}
                      onChange={() =>
                        setCm((prev) => (prev ? { ...prev, commentBody: !prev.commentBody } : prev))
                      }
                      className="h-4 w-4 accent-primary"
                    />
                    Commenter le corps de la fonction
                  </label>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
                    Profondeur de contexte
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={cm.depth}
                      onChange={(e) =>
                        setCm((prev) =>
                          prev
                            ? { ...prev, depth: Math.max(1, parseInt(e.target.value) || 3) }
                            : prev
                        )
                      }
                      className="w-16 rounded-md border border-input bg-background px-2 py-1 text-xs"
                    />
                  </label>
                </div>

                <HeaderFunctionSelector
                  headers={cm.headers}
                  selected={cm.selected}
                  onChange={(next) => setCm((prev) => (prev ? { ...prev, selected: next } : prev))}
                />
              </>
            )}

            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button variant="outline" onClick={closeCommenter} disabled={cm.stage === 'starting'}>
                Annuler
              </Button>
              <Button
                onClick={() => void startCommenter()}
                disabled={
                  cm.stage !== 'selecting' ||
                  cm.selected.size === 0 ||
                  (!cm.commentHeader && !cm.commentBody)
                }
              >
                {cm.stage === 'starting' ? 'Démarrage…' : `Commenter (${cm.selected.size})`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Test-generator: clone + header/function selection modal */}
      {tg && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg border shadow-xl w-full max-w-2xl p-6 flex flex-col gap-4 max-h-[85vh]">
            <div>
              <h2 className="text-lg font-semibold">🧪 Générer des tests</h2>
              <p className="text-sm text-muted-foreground">
                {tg.repo.name} · branche <code className="text-xs">{tg.branch}</code>
              </p>
            </div>

            {tg.stage === 'cloning' && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Clonage et analyse du dépôt en cours…
              </p>
            )}

            {tg.stage === 'error' && (
              <p className="text-sm text-destructive">{tg.error ?? 'Erreur inconnue.'}</p>
            )}

            {(tg.stage === 'selecting' || tg.stage === 'starting') && (
              <>
                <p className="text-xs text-muted-foreground">
                  Sélectionnez les fonctions à tester. Cliquez un header pour voir ses fonctions et
                  le fichier qui les implémente.
                </p>
                <HeaderFunctionSelector
                  headers={tg.headers}
                  selected={tg.selected}
                  onChange={(next) => setTg((prev) => (prev ? { ...prev, selected: next } : prev))}
                />
              </>
            )}

            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button variant="outline" onClick={closeTg} disabled={tg.stage === 'starting'}>
                Annuler
              </Button>
              <Button
                onClick={() => void startTestGen()}
                disabled={tg.stage !== 'selecting' || tg.selected.size === 0}
              >
                {tg.stage === 'starting' ? 'Démarrage…' : `Générer les tests (${tg.selected.size})`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Warning-corrector: clone + header/function selection modal */}
      {wc && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg border shadow-xl w-full max-w-2xl p-6 flex flex-col gap-4 max-h-[85vh]">
            <div>
              <h2 className="text-lg font-semibold">⚠️ Corriger les warnings</h2>
              <p className="text-sm text-muted-foreground">
                {wc.repo.name} · branche <code className="text-xs">{wc.branch}</code>
              </p>
            </div>

            {wc.stage === 'cloning' && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Clonage et analyse du dépôt en cours…
              </p>
            )}

            {wc.stage === 'error' && (
              <p className="text-sm text-destructive">{wc.error ?? 'Erreur inconnue.'}</p>
            )}

            {(wc.stage === 'selecting' || wc.stage === 'starting') && (
              <>
                <p className="text-xs text-muted-foreground">
                  Le script <code className="text-[11px]">ai_compil.sh</code> /{' '}
                  <code className="text-[11px]">.bat</code> du dépôt sera exécuté pour générer{' '}
                  <code className="text-[11px]">warning.txt</code>. Seuls les warnings des fonctions
                  sélectionnées seront corrigés, avec le contexte de l&apos;arbre de code.
                </p>

                <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 px-3 py-2">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    Nombre de tentatives (recompilation)
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={wc.maxRetries}
                      onChange={(e) =>
                        setWc((prev) =>
                          prev
                            ? {
                                ...prev,
                                maxRetries: Math.max(0, Math.min(5, parseInt(e.target.value) || 0))
                              }
                            : prev
                        )
                      }
                      className="w-16 rounded-md border border-input bg-background px-2 py-1 text-xs"
                    />
                  </label>
                </div>

                {wc.scriptFound === false && (
                  <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 space-y-2">
                    <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400">
                      Aucun fichier <code className="text-[11px]">ai_compil.bat</code> détecté dans
                      le dépôt. Un script de compilation est nécessaire : éditez le template
                      ci-dessous, il sera ajouté à la racine du projet avant la correction.
                    </p>
                    <textarea
                      value={wc.scriptTemplate}
                      onChange={(e) =>
                        setWc((prev) => (prev ? { ...prev, scriptTemplate: e.target.value } : prev))
                      }
                      spellCheck={false}
                      rows={10}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Contenu du script ai_compil.bat…"
                    />
                  </div>
                )}

                <HeaderFunctionSelector
                  headers={wc.headers}
                  selected={wc.selected}
                  onChange={(next) => setWc((prev) => (prev ? { ...prev, selected: next } : prev))}
                />
              </>
            )}

            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button variant="outline" onClick={closeWc} disabled={wc.stage === 'starting'}>
                Annuler
              </Button>
              <Button
                onClick={() => void startWarningCorrector()}
                disabled={
                  wc.stage !== 'selecting' ||
                  wc.selected.size === 0 ||
                  (wc.scriptFound === false && wc.scriptTemplate.trim().length === 0)
                }
              >
                {wc.stage === 'starting'
                  ? 'Démarrage…'
                  : wc.scriptFound === false
                    ? `Ajouter ai_compil.bat & corriger (${wc.selected.size})`
                    : `Corriger les warnings (${wc.selected.size})`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
