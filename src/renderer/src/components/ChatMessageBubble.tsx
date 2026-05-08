import * as React from 'react'
import type { ChatMessage } from '@shared/types'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/components/ui/badge'

type Props = {
  message: ChatMessage
}

function formatToolArgs(args: unknown): string {
  try {
    const text = JSON.stringify(args, null, 2)
    return text.length > 600 ? text.slice(0, 600) + '…' : text
  } catch {
    return String(args)
  }
}

function formatToolResult(result: unknown): string {
  try {
    const text = JSON.stringify(result, null, 2)
    return text.length > 1200 ? text.slice(0, 1200) + '…' : text
  } catch {
    return String(result)
  }
}

function ChatMessageBubble({ message }: Props): React.JSX.Element {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] space-y-2 rounded-lg px-4 py-3 text-sm shadow-sm',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'border border-border bg-card text-card-foreground'
        )}
      >
        {message.toolEvents && message.toolEvents.length > 0 && (
          <div className="space-y-1 border-b border-border/50 pb-2">
            {message.toolEvents.map((event, idx) => (
              <details
                key={`${event.toolCallId}-${idx}`}
                className="rounded-md bg-muted/40 px-2 py-1 text-xs"
              >
                <summary className="cursor-pointer">
                  <Badge variant={event.kind === 'call' ? 'secondary' : event.error ? 'destructive' : 'success'} className="mr-2">
                    {event.kind === 'call' ? 'tool' : event.error ? 'error' : 'result'}
                  </Badge>
                  <code className="text-xs">{event.name}</code>
                </summary>
                {event.kind === 'call' && (
                  <pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
                    {formatToolArgs(event.args)}
                  </pre>
                )}
                {event.kind === 'result' && (
                  <pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
                    {event.error ? `Erreur : ${event.error}` : formatToolResult(event.result)}
                  </pre>
                )}
              </details>
            ))}
          </div>
        )}
        <div className="whitespace-pre-wrap leading-relaxed">
          {message.content || (
            <span className="italic text-muted-foreground">{isUser ? '' : '…'}</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatMessageBubble
