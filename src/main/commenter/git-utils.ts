import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)

const SOURCE_GLOBS = ['*.c', '*.h', '*.cpp', '*.hpp', '*.cxx', '*.hxx', '*.cc']

export async function execGit(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
      maxBuffer: 10 * 1024 * 1024
    })
    return stdout.trim()
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string }
    const detail = e.stderr?.trim() || e.message || String(err)
    throw new Error(`git ${args[0]} failed: ${detail}`)
  }
}

export async function listSourceFiles(cwd: string): Promise<string[]> {
  const output = await execGit(['ls-files', '--', ...SOURCE_GLOBS], cwd)
  if (!output) return []
  return output.split('\n').filter(Boolean)
}

export async function listChangedFiles(cwd: string): Promise<string[]> {
  // Files touched in HEAD — works with --depth 1 shallow clones
  const output = await execGit(
    ['diff-tree', '--no-commit-id', '-r', '--name-only', 'HEAD'],
    cwd
  )
  if (!output) return []
  return output.split('\n').filter(Boolean)
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  return execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
}

export async function checkoutBranch(cwd: string, name: string): Promise<void> {
  await execGit(['checkout', name], cwd)
}

export async function createBranch(cwd: string, name: string): Promise<void> {
  await execGit(['checkout', '-b', name], cwd)
}

export async function listRemoteBranches(cwd: string): Promise<string[]> {
  let output: string
  try {
    output = await execGit(['branch', '-r'], cwd)
  } catch {
    return []
  }
  return output
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('HEAD'))
    .map((l) => l.replace(/^origin\//, ''))
}

export async function gitAdd(cwd: string): Promise<void> {
  await execGit(['add', '.'], cwd)
}

export async function gitCommit(cwd: string, message: string): Promise<void> {
  await execGit(['commit', '-m', message], cwd)
}

export async function gitPush(cwd: string, branch: string): Promise<void> {
  await execGit(['push', '-u', 'origin', branch], cwd)
}

export async function cloneRepo(cloneUrl: string, targetDir: string, branch?: string): Promise<void> {
  const args = ['clone', '--depth', '1']
  if (branch) args.push('--branch', branch)
  args.push(cloneUrl, targetDir)
  try {
    await execFileAsync('git', args, { maxBuffer: 50 * 1024 * 1024 })
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string }
    const detail = e.stderr?.trim() || e.message || String(err)
    throw new Error(`git clone failed: ${detail}`)
  }
}

const TEST_DIR_NAMES = ['test', 'tests', 'Test', 'Tests', 'unittest', 'unittests']

export async function findTestDirectory(cwd: string): Promise<string> {
  for (const name of TEST_DIR_NAMES) {
    if (existsSync(join(cwd, name))) return name
  }
  return ''
}

export async function resolveBranchName(cwd: string, base: string): Promise<string> {
  const remotes = await listRemoteBranches(cwd)
  if (!remotes.includes(base)) return base
  for (let i = 1; i <= 999; i++) {
    const candidate = `${base}_${String(i).padStart(3, '0')}`
    if (!remotes.includes(candidate)) return candidate
  }
  throw new Error(`Impossible de trouver un nom de branche libre pour: ${base}`)
}
