import * as React from 'react'
import { useEffect } from 'react'
import { useCppProject } from '@renderer/stores/cppProject.store'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { FolderTree, FolderOpen, AlertTriangle, CheckCircle2 } from 'lucide-react'

type Props = {
  required?: boolean
  hint?: string
}

export default function CppProjectBanner({ required = false, hint }: Props): React.JSX.Element {
  const { project, loaded, loading, refresh, pick, clear } = useCppProject()

  useEffect(() => {
    if (!loaded && !loading) void refresh()
  }, [loaded, loading, refresh])

  const hasProject = !!project.path
  const isHealthy = hasProject && project.exists && project.hasCMake

  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 flex flex-wrap items-center gap-2 text-sm">
      <FolderTree className="size-4 text-muted-foreground shrink-0" />
      <span className="font-medium shrink-0">Projet C/C++ :</span>

      {!hasProject && (
        <span className="text-muted-foreground italic flex-1 min-w-0">
          {required ? 'Aucun projet sélectionné — requis pour cette fonctionnalité.' : 'Aucun projet sélectionné.'}
          {hint && <span className="block text-xs">{hint}</span>}
        </span>
      )}

      {hasProject && (
        <>
          <span
            className="font-mono text-xs truncate flex-1 min-w-0"
            title={project.path ?? ''}
          >
            {project.path}
          </span>
          {isHealthy ? (
            <Badge variant="success" className="shrink-0 gap-1">
              <CheckCircle2 className="size-3" />
              CMake détecté
            </Badge>
          ) : (
            <Badge variant="destructive" className="shrink-0 gap-1">
              <AlertTriangle className="size-3" />
              {!project.exists ? 'Dossier introuvable' : 'Pas de CMakeLists.txt'}
            </Badge>
          )}
        </>
      )}

      <Button
        variant="outline"
        size="sm"
        className="shrink-0 h-7"
        onClick={() => void pick()}
        disabled={loading}
      >
        <FolderOpen className="mr-1 size-3.5" />
        {hasProject ? 'Changer…' : 'Sélectionner…'}
      </Button>
      {hasProject && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 h-7 text-muted-foreground"
          onClick={() => void clear()}
          disabled={loading}
          title="Oublier le projet"
        >
          ✕
        </Button>
      )}
    </div>
  )
}
