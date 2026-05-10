import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Download } from 'lucide-react'
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

type CodeBlock = { lang: string; code: string; filename: string }

const LANG_TO_EXT: Record<string, string> = {
  c: 'c', h: 'h', cpp: 'cpp', 'c++': 'cpp', cxx: 'cpp', hxx: 'hpp', cc: 'cc', hpp: 'hpp',
  python: 'py', py: 'py',
  javascript: 'js', js: 'js', jsx: 'jsx',
  typescript: 'ts', ts: 'ts', tsx: 'tsx',
  java: 'java', rust: 'rs', rs: 'rs', go: 'go',
  ruby: 'rb', rb: 'rb', php: 'php', swift: 'swift', kotlin: 'kt',
  shell: 'sh', bash: 'sh', sh: 'sh',
  json: 'json', yaml: 'yml', yml: 'yml',
  xml: 'xml', html: 'html', css: 'css', sql: 'sql',
  markdown: 'md', md: 'md'
}

function extractCodeBlocks(content: string): CodeBlock[] {
  const results: CodeBlock[] = []
  const re = /```(\w+)?\r?\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  let idx = 1
  while ((m = re.exec(content)) !== null) {
    const lang = (m[1] ?? '').toLowerCase()
    const code = m[2] ?? ''
    if (!code.trim()) continue
    const ext = LANG_TO_EXT[lang] ?? (lang || 'txt')
    results.push({ lang, code, filename: `file_${idx++}.${ext}` })
  }
  return results
}

function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function ChatMessageBubble({ message }: Props): React.JSX.Element {
  const isUser = message.role === 'user'
  const codeBlocks = React.useMemo(
    () => (!isUser && message.content ? extractCodeBlocks(message.content) : []),
    [isUser, message.content]
  )
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
        {isUser ? (
          <div className="whitespace-pre-wrap leading-relaxed">
            {message.content || ''}
          </div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed
            [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
            [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4
            [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4
            [&_li]:my-0.5
            [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-1
            [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1
            [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-0.5
            [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_code]:font-mono
            [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:my-2
            [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[11px]
            [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote]:italic
            [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_table]:my-2
            [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted [&_th]:font-semibold
            [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1
            [&_a]:underline [&_a]:text-primary
            [&_hr]:border-border [&_hr]:my-2">
            {message.content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            ) : (
              <span className="italic text-muted-foreground">…</span>
            )}
          </div>
        )}
        {codeBlocks.length > 0 && (
          <div className="border-t border-border/50 pt-2 mt-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Télécharger les fichiers
            </p>
            <div className="flex flex-wrap gap-1.5">
              {codeBlocks.map((block) => (
                <button
                  key={block.filename}
                  onClick={() => downloadFile(block.filename, block.code)}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-mono hover:bg-muted transition-colors"
                  title={`Télécharger ${block.filename}`}
                >
                  <Download className="size-3 shrink-0" />
                  {block.filename}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ChatMessageBubble
