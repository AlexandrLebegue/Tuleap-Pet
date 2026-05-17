import { ipcMain } from 'electron'
import { execa } from 'execa'
import { mkdtemp, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildTuleapClient, mapArtifactDetail } from '../tuleap'
import { formatArtifactContext } from '../coder/context'
import { audit } from '../store/db'
import { applyWrite } from '../llm/write-tools'

export type TicketBranchRequest = {
  artifactId: number
  repoPath: string
  baseBranch: string
  branchPrefix?: string
  pushImmediately?: boolean
  postComment?: boolean
  pushRemote?: string
}

export type TicketBranchResult =
  | {
      ok: true
      branchName: string
      contextMarkdown: string
      commitMessage: string
      prBodyDraft: string
      pushed: boolean
    }
  | { ok: false; error: string }

function kebab(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function registerTicketBranchHandlers(): void {
  ipcMain.handle(
    'ticket-branch:preview',
    async (_evt, args: { artifactId: number }): Promise<{
      ok: true
      branchName: string
      commitMessage: string
      prBody: string
      contextMarkdown: string
    } | { ok: false; error: string }> => {
      try {
        const client = await buildTuleapClient()
        const raw = await client.getArtifact(args.artifactId)
        const detail = mapArtifactDetail(raw)
        const slug = kebab(detail.title || `artifact-${detail.id}`)
        const branchName = `feature/${detail.id}-${slug}`
        const commitMessage = `feat: ${detail.title} (#${detail.id})`
        const contextMarkdown = formatArtifactContext(detail)
        const prBody = `## Lié à Tuleap #${detail.id}\n\n**${detail.title}**\n\n${
          detail.description ? `### Description\n\n${detail.description.slice(0, 600)}\n\n` : ''
        }${
          detail.htmlUrl ? `🔗 Lien Tuleap : ${detail.htmlUrl}\n\n` : ''
        }---\n_Branche scaffoldée par Tuleap AI Companion._`
        return { ok: true, branchName, commitMessage, prBody, contextMarkdown }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false, error: message }
      }
    }
  )

  ipcMain.handle(
    'ticket-branch:execute',
    async (_evt, args: TicketBranchRequest): Promise<TicketBranchResult> => {
      try {
        const client = await buildTuleapClient()
        const raw = await client.getArtifact(args.artifactId)
        const detail = mapArtifactDetail(raw)
        const slug = kebab(detail.title || `artifact-${detail.id}`)
        const prefix = args.branchPrefix ?? 'feature'
        const branchName = `${prefix}/${detail.id}-${slug}`
        const commitMessage = `feat: ${detail.title} (#${detail.id})`
        const prBody = `## Lié à Tuleap #${detail.id}\n\n**${detail.title}**\n\n${
          detail.description ? `### Description\n\n${detail.description.slice(0, 600)}\n\n` : ''
        }${
          detail.htmlUrl ? `🔗 Lien Tuleap : ${detail.htmlUrl}\n\n` : ''
        }---\n_Branche scaffoldée par Tuleap AI Companion._`
        const contextMarkdown = formatArtifactContext(detail)

        await mkdir(args.repoPath, { recursive: true }).catch(() => {})
        await execa('git', ['fetch', args.pushRemote ?? 'origin', args.baseBranch], {
          cwd: args.repoPath
        }).catch(() => {})
        await execa('git', ['checkout', '-B', branchName, `${args.pushRemote ?? 'origin'}/${args.baseBranch}`], {
          cwd: args.repoPath
        }).catch(async () => {
          await execa('git', ['checkout', '-B', branchName, args.baseBranch], {
            cwd: args.repoPath
          })
        })

        let pushed = false
        if (args.pushImmediately) {
          await execa('git', ['push', '-u', args.pushRemote ?? 'origin', branchName], {
            cwd: args.repoPath
          })
          pushed = true
        }

        if (args.postComment) {
          await applyWrite({
            kind: 'add_comment',
            artifactId: detail.id,
            comment: `🚀 Démarrage du développement sur la branche \`${branchName}\`.`
          }).catch(() => {})
        }

        audit('ticket-branch.execute', String(detail.id), { branchName, pushed })
        return { ok: true, branchName, contextMarkdown, commitMessage, prBodyDraft: prBody, pushed }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false, error: message }
      }
    }
  )

  ipcMain.handle('ticket-branch:choose-repo', async () => {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Choisir un dépôt git'
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false as const, cancelled: true }
    }
    return { ok: true as const, path: result.filePaths[0]! }
  })

  ipcMain.handle('ticket-branch:make-tempdir', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tuleap-companion-'))
    return { ok: true as const, path: dir }
  })
}
