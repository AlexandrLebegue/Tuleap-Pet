import * as React from 'react'
import type { CommentingOptions } from '@shared/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@renderer/components/ui/card'
import { AlertTriangle, Sparkles } from 'lucide-react'

type Props = {
  options: CommentingOptions
  onChange: (opts: CommentingOptions) => void
  disabled?: boolean
  showOnlyChangedFiles?: boolean
  showContextPipeline?: boolean
  projectReady?: boolean
  compact?: boolean
}

const STANDARD_OPTIONS: [keyof CommentingOptions, string, string][] = [
  ['preserveExisting', 'Préserver les commentaires existants', ''],
  ['addFileHeader', "Ajouter l'en-tête de fichier", ''],
  ['detailedComments', 'Commentaires détaillés', ''],
  ['applyCodingRules', 'Appliquer les règles de codage', 'Renomme les variables et convertit les types. Attention : modifie le code.']
]

export default function CommentingOptionsPanel({
  options,
  onChange,
  disabled = false,
  showOnlyChangedFiles = false,
  showContextPipeline = false,
  projectReady = true,
  compact = false
}: Props): React.JSX.Element {
  const toggle = (key: keyof CommentingOptions): void => {
    onChange({ ...options, [key]: !options[key] })
  }

  const set = (key: keyof CommentingOptions, value: unknown): void => {
    onChange({ ...options, [key]: value })
  }

  return (
    <Card>
      <CardHeader className={compact ? 'pb-1 pt-3 px-3' : 'pb-2'}>
        <CardTitle className="text-sm">Options de commentaire</CardTitle>
        {!compact && (
          <CardDescription className="text-xs">
            Les règles de codage (types + nommage) sont désactivées par défaut.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className={`space-y-3 ${compact ? 'px-3 pb-3' : ''}`}>
        {STANDARD_OPTIONS.map(([key, label, desc]) => (
          <label key={key} className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!options[key]}
              onChange={() => toggle(key)}
              disabled={disabled}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <div>
              <span className={`text-sm ${key === 'applyCodingRules' ? 'text-orange-600 dark:text-orange-400 font-medium' : ''}`}>
                {label}
              </span>
              {desc && !compact && <p className="text-xs text-muted-foreground">{desc}</p>}
            </div>
          </label>
        ))}

        {showOnlyChangedFiles && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!options.onlyChangedFiles}
              onChange={() => toggle('onlyChangedFiles')}
              disabled={disabled}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-sm">Fichiers modifiés uniquement (dernier commit)</span>
          </label>
        )}

        {showContextPipeline && (
          <div className={`border rounded-md ${compact ? 'p-2' : 'p-3'} space-y-2 mt-1`}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Pipeline de commentaire
            </p>

            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="radio"
                name="pipeline-mode"
                checked={!options.useContextPipeline}
                onChange={() => set('useContextPipeline', false)}
                disabled={disabled}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <div>
                <div className="text-sm font-medium">Basique</div>
                {!compact && (
                  <div className="text-xs text-muted-foreground">
                    Chaque fichier est traité en un seul appel LLM. Rapide, adapté aux projets sans call-graph complexe.
                  </div>
                )}
              </div>
            </label>

            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="radio"
                name="pipeline-mode"
                checked={!!options.useContextPipeline}
                onChange={() => set('useContextPipeline', true)}
                disabled={disabled}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <div>
                <div className="text-sm font-medium flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-primary" />
                  Avancée — pipeline contextuelle
                </div>
                {!compact && (
                  <div className="text-xs text-muted-foreground">
                    Pour chaque fonction, l'IA évalue si le commentaire existant est suffisant. Sinon, elle en génère un nouveau avec le call-graph (BFS prof. 3) et le header associé.
                  </div>
                )}
              </div>
            </label>

            {options.useContextPipeline && !projectReady && (
              <div className="flex items-start gap-2 text-xs text-orange-600 dark:text-orange-400 pl-6">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                <span>Source C/C++ non configurée — sélectionnez d'abord un dossier ou dépôt valide.</span>
              </div>
            )}

            {options.useContextPipeline && (
              <div className="pl-6 space-y-2 pt-1 border-t">
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!options.forceAll}
                    onChange={() => toggle('forceAll')}
                    disabled={disabled}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <div>
                    <div className="text-sm">Forcer la regénération sur toutes les fonctions</div>
                    {!compact && (
                      <div className="text-xs text-muted-foreground">
                        Ignore le verdict de l'évaluateur (utile pour audit / réécriture de masse).
                      </div>
                    )}
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!options.inlineComments}
                    onChange={() => toggle('inlineComments')}
                    disabled={disabled}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <div>
                    <div className="text-sm">Commentaires inline (if / for / variables)</div>
                    {!compact && (
                      <div className="text-xs text-muted-foreground">
                        Ajoute des commentaires de flux à l'intérieur du corps de chaque fonction (2e appel LLM par fonction).
                      </div>
                    )}
                  </div>
                </label>

                {!compact && (
                  <div className="flex items-center gap-2 text-sm">
                    <label className="shrink-0 text-muted-foreground text-xs">Profondeur BFS</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={options.contextDepth ?? 3}
                      onChange={(e) => set('contextDepth', Math.max(1, parseInt(e.target.value) || 3))}
                      disabled={disabled}
                      className="w-16 rounded-md border border-input bg-background px-2 py-1 text-xs"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
