import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getIntegrationClient, getIntegrationEnv } from './_helpers/client'

/**
 * Reproduit le bug "L'affichage des commits ne marche pas — erreur API Tuleap" :
 * Tuleap REST ne propose pas d'endpoint `GET /git/{id}/commits` (404). Le client
 * doit donc construire la liste à partir du tip de branche embarqué dans
 * `GET /git/{id}/branches`.
 *
 * Le test crée un repo dédié, y pousse 2 commits via git CLI + auth admin,
 * puis valide que `listCommits({ refName })` rend bien le tip.
 *
 * Gated derrière TULEAP_RUN_GIT_COMMITS_TESTS=1 car nécessite git CLI + accès
 * réseau au container Tuleap. Le bootstrap CI peut activer en exportant la var.
 */
const shouldRun = process.env.TULEAP_RUN_GIT_COMMITS_TESTS === '1'
const adminPassword =
  process.env.SITE_ADMINISTRATOR_PASSWORD ?? process.env.CI_USER_PASSWORD ?? ''

describe.skipIf(!shouldRun)('Git commits read [integration]', () => {
  const client = getIntegrationClient()
  const env = getIntegrationEnv()
  const repoName = `commits-test-${Date.now()}`
  let repoId = 0
  let baseHost = ''
  let tipSha = ''

  beforeAll(async () => {
    if (!adminPassword) {
      throw new Error('SITE_ADMINISTRATOR_PASSWORD requis pour pousser les commits')
    }
    const url = new URL(env.baseUrl)
    baseHost = `${url.hostname}:${url.port || (url.protocol === 'https:' ? 443 : 80)}`

    const response = await fetch(`${env.baseUrl}/api/git`, {
      method: 'POST',
      headers: {
        'X-Auth-AccessKey': env.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ project_id: env.projectId, name: repoName })
    })
    if (!response.ok) throw new Error(`POST /api/git: ${response.status}`)
    const created = (await response.json()) as { id: number; path: string }
    repoId = created.id

    const workdir = mkdtempSync(join(tmpdir(), 'tuleap-git-it-'))
    writeFileSync(join(workdir, 'README.md'), 'hello\n')
    const g = (cmd: string): void => {
      execSync(cmd, {
        cwd: workdir,
        stdio: 'ignore',
        env: { ...process.env, GIT_SSL_NO_VERIFY: '1', GIT_TERMINAL_PROMPT: '0' }
      })
    }
    g('git init -q -b main')
    g('git config commit.gpgsign false')
    g('git config user.email test@example.com')
    g('git config user.name "Integration Test"')
    g('git add README.md')
    g('git -c commit.gpgsign=false commit -q --no-gpg-sign -m "first commit"')
    writeFileSync(join(workdir, 'README.md'), 'hello\nworld\n')
    g('git -c commit.gpgsign=false commit -aq --no-gpg-sign -m "second commit"')
    tipSha = execSync('git rev-parse HEAD', { cwd: workdir }).toString().trim()
    const cloneUrl = `https://admin:${encodeURIComponent(adminPassword)}@${baseHost}/plugins/git/${created.path.replace(/\.git$/, '')}.git`

    // Gitolite met quelques secondes à propager les permissions après POST /api/git.
    // On retry le push jusqu'à 30s avant d'abandonner.
    let lastErr: unknown
    for (let attempt = 0; attempt < 15; attempt += 1) {
      try {
        execSync(`git -c http.sslVerify=false push ${cloneUrl} HEAD:refs/heads/main`, {
          cwd: workdir,
          stdio: 'pipe',
          env: { ...process.env, GIT_SSL_NO_VERIFY: '1', GIT_TERMINAL_PROMPT: '0' }
        })
        lastErr = null
        break
      } catch (err) {
        lastErr = err
        await new Promise((r) => setTimeout(r, 2000))
      }
    }
    if (lastErr) throw lastErr
    if (!existsSync(workdir)) throw new Error('workdir gone')
  }, 60000)

  afterAll(async () => {
    if (!repoId) return
    await fetch(`${env.baseUrl}/api/git/${repoId}`, {
      method: 'DELETE',
      headers: { 'X-Auth-AccessKey': env.token }
    }).catch(() => undefined)
  })

  it('listCommits renvoie le tip de la branche demandée', async () => {
    const branches = await client.listBranches(repoId)
    expect(branches.items.some((b) => b.name === 'main')).toBe(true)

    const commits = await client.listCommits(repoId, { refName: 'main' })
    expect(commits.total).toBe(1)
    expect(commits.items).toHaveLength(1)
    expect(commits.items[0]!.id).toBe(tipSha)
    expect(commits.items[0]!.title).toBe('second commit')
  })

  it('listCommits renvoie vide pour une branche inconnue (au lieu de 404)', async () => {
    const commits = await client.listCommits(repoId, { refName: 'does-not-exist' })
    expect(commits.items).toEqual([])
    expect(commits.total).toBe(0)
  })

  it('listCommits renvoie vide quand refName est omis (pas de 404 Tuleap)', async () => {
    const commits = await client.listCommits(repoId)
    expect(commits.items).toEqual([])
    expect(commits.total).toBe(0)
  })
})
