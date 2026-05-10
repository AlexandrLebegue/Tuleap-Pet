import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSettings } from '@renderer/stores/settings.store'
import { useChat } from '@renderer/stores/chat.store'
import { Card, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Trash2, Plus, Send, Pencil, Check, X, Brain, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import ChatMessageBubble from '@renderer/components/ChatMessageBubble'
import type { ChatConversation, LlmProviderKind } from '@shared/types'

/** Editable conversation header with model info */
function ConversationHeader({
  conv,
  llmProvider,
  localModel,
  llmModel,
  onRename
}: {
  conv: ChatConversation | null
  llmProvider: LlmProviderKind
  localModel: string | null
  llmModel: string
  onRename: (id: number, title: string) => Promise<void>
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = useCallback(() => {
    if (!conv) return
    setEditValue(conv.title)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [conv])

  const confirmEdit = useCallback(async () => {
    if (!conv) return
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== conv.title) {
      await onRename(conv.id, trimmed)
    }
    setEditing(false)
  }, [conv, editValue, onRename])

  const cancelEdit = useCallback(() => setEditing(false), [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') void confirmEdit()
      if (e.key === 'Escape') cancelEdit()
    },
    [confirmEdit, cancelEdit]
  )

  return (
    <header className="border-b border-border px-6 py-3">
      <div className="flex items-center gap-2">
        {!editing ? (
          <>
            <h2 className="text-lg font-semibold tracking-tight">
              {conv ? conv.title : 'Aucune conversation sélectionnée'}
            </h2>
            {conv && (
              <button
                onClick={startEdit}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Renommer"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
          </>
        ) : (
          <>
            <Input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => void confirmEdit()}
              className="h-8 text-lg font-semibold"
            />
            <button
              onClick={() => void confirmEdit()}
              className="text-green-600 hover:text-green-500"
              aria-label="Confirmer"
            >
              <Check className="size-4" />
            </button>
            <button
              onClick={cancelEdit}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Annuler"
            >
              <X className="size-4" />
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Modèle :{' '}
        <code>{llmProvider === 'local' ? localModel ?? 'local' : llmModel}</code> · Tools :
        get_self, list_projects, list_trackers, list_artifacts, get_artifact, list_milestones
      </p>
    </header>
  )
}

function Chatbot(): React.JSX.Element {
  const config = useSettings((s) => s.config)

  const conversations = useChat((s) => s.conversations)
  const selectedId = useChat((s) => s.selectedId)
  const messages = useChat((s) => s.messages)
  const status = useChat((s) => s.status)
  const draft = useChat((s) => s.draft)
  const errorMessage = useChat((s) => s.errorMessage)

  const init = useChat((s) => s.init)
  const shutdown = useChat((s) => s.shutdown)
  const refresh = useChat((s) => s.refresh)
  const open = useChat((s) => s.open)
  const newConversation = useChat((s) => s.newConversation)
  const rename = useChat((s) => s.rename)
  const remove = useChat((s) => s.remove)
  const send = useChat((s) => s.send)
  const setDraft = useChat((s) => s.setDraft)
  const thinking = useChat((s) => s.thinking)
  const setThinking = useChat((s) => s.setThinking)

  const [sidebarOpen, setSidebarOpen] = useState(true)

  const llmReady =
    config.llmProvider === 'local'
      ? Boolean(config.localBaseUrl && config.localModel)
      : config.hasLlmKey
  const ready = config.tuleapUrl && config.hasToken && llmReady

  useEffect(() => {
    init()
    void refresh()
    return () => shutdown()
  }, [init, refresh, shutdown])

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const messageCount = messages.length
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messageCount, status])

  const selectedConv = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  )

  if (!ready) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h2 className="text-2xl font-semibold tracking-tight">Chatbot</h2>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Configuration requise</CardTitle>
            <CardDescription>
              Renseignez le token Tuleap et la clé OpenRouter dans{' '}
              <Link to="/settings" className="underline">
                Réglages
              </Link>{' '}
              avant d&apos;ouvrir une conversation.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && status !== 'sending' && status !== 'streaming') {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="flex h-full">
      {sidebarOpen ? (
        <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-muted/20">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold tracking-tight">Conversations</h3>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => newConversation()} aria-label="Nouvelle">
                <Plus className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setSidebarOpen(false)} aria-label="Masquer">
                <PanelLeftClose className="size-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {conversations.length === 0 && (
              <p className="px-2 py-4 text-xs text-muted-foreground">
                Aucune conversation. Cliquez sur + pour démarrer.
              </p>
            )}
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => open(conv.id)}
                className={cn(
                  'group flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors',
                  conv.id === selectedId
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate" title={conv.title}>
                    {conv.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(conv.updatedAt).toLocaleString()}
                  </p>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    void remove(conv.id)
                  }}
                  className="ml-2 hidden text-muted-foreground hover:text-destructive group-hover:inline-flex"
                  aria-label="Supprimer"
                >
                  <Trash2 className="size-3.5" />
                </span>
              </button>
            ))}
          </div>
        </aside>
      ) : (
        <div className="flex h-full shrink-0 flex-col border-r border-border bg-muted/20">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setSidebarOpen(true)}
            aria-label="Afficher les conversations"
            className="m-2"
            title="Afficher les conversations"
          >
            <PanelLeftOpen className="size-4" />
          </Button>
        </div>
      )}

      <section className="flex h-full flex-1 flex-col">
        <ConversationHeader
          conv={selectedConv}
          llmProvider={config.llmProvider}
          localModel={config.localModel}
          llmModel={config.llmModel}
          onRename={rename}
        />

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto px-6 py-4">
          {!selectedConv && (
            <p className="mt-10 text-center text-sm text-muted-foreground">
              Sélectionnez une conversation à gauche ou cliquez sur + pour en créer une nouvelle.
            </p>
          )}
          {messages
            .filter((m) => m.role !== 'system')
            .map((m) => (
              <ChatMessageBubble key={m.id} message={m} />
            ))}
          {status === 'streaming' && (
            <p className="text-xs text-muted-foreground">L&apos;assistant rédige…</p>
          )}
          {errorMessage && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
              {errorMessage}
            </div>
          )}
        </div>

        {selectedConv && (
          <footer className="border-t border-border px-6 py-3">
            <div className="flex gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                placeholder="Posez une question — Entrée pour envoyer, Maj+Entrée pour un saut de ligne."
                className="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex flex-col gap-2">
                <Button
                  size="icon"
                  variant={thinking ? 'default' : 'outline'}
                  onClick={() => setThinking(!thinking)}
                  title={thinking ? 'Thinking activé — cliquer pour désactiver' : 'Activer le mode thinking (raisonnement étendu)'}
                >
                  <Brain className="size-4" />
                </Button>
                <Button
                  onClick={() => send()}
                  disabled={!draft.trim() || status === 'sending' || status === 'streaming'}
                >
                  <Send className="size-4" />
                </Button>
              </div>
            </div>
          </footer>
        )}
      </section>
    </div>
  )
}

export default Chatbot
