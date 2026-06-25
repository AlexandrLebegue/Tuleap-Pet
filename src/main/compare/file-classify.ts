/**
 * Pure heuristic classifier for diff file paths. No imports → unit-testable.
 *
 * The goal is to separate **high-signal source/test code** (where real features
 * live) from **low-signal noise** (generated project files, vendored deps, build
 * output, lock files) that dominates large infrastructures — e.g. a 16M-line
 * MSBuild `.vcxproj.filters` diff that drowns the actual code changes.
 */

export type FileCategory = 'source' | 'test' | 'config' | 'generated' | 'other'

const SOURCE_EXT =
  /\.(c|h|cc|cpp|cxx|hpp|hxx|inl|cs|java|py|ts|tsx|js|jsx|mjs|cjs|go|rs|rb|php|kt|kts|swift|m|mm|scala|sh|bash|ps1|lua|vue|svelte|r|jl|dart|ex|exs|clj|hs|ml|f90|f95|for|vhd|v|sv)$/i

const CONFIG_EXT =
  /\.(json|ya?ml|toml|ini|cfg|conf|xml|cmake|props|targets|gradle|properties|config|editorconfig|env|dockerfile)$/i

const CONFIG_NAME =
  /^(cmakelists\.txt|makefile|dockerfile|\.gitignore|\.gitattributes|\.clang-format|\.clang-tidy)$/i

/** Generated / vendored / build-output paths that should be excluded from the AI sample. */
const GENERATED_PATH =
  /(^|\/)(node_modules|bower_components|vendor|third_party|dist|build|out|obj|bin|target|\.vs|\.vscode|__pycache__|\.next|\.nuxt|coverage|cmake-build[^/]*|packages|generated|gen)\//i

const GENERATED_EXT =
  /\.(vcxproj|vcproj|filters|sln|csproj|fsproj|vbproj|suo|user|pbxproj|xcworkspacedata|designer\.cs|min\.js|min\.css|map|lock|d\.ts|pb\.go|pb\.cc|pb\.h|_pb2\.py|generated\.[a-z]+)$/i

const GENERATED_NAME =
  /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|cargo\.lock|poetry\.lock|composer\.lock|gemfile\.lock|go\.sum)$/i

const TEST_PATH = /(^|\/)(tests?|__tests__|spec|specs|unittests?|googletest|gtest)\//i
const TEST_NAME =
  /(^test_|_test\.|\.test\.|\.spec\.|test[A-Z].*\.(c|cpp|cc|cs|java)$|tests?\.(c|cpp|cc)$)/i

/** Classify a diff file path into a coarse category. */
export function classifyDiffPath(rawPath: string): FileCategory {
  const path = rawPath.trim().replace(/\\/g, '/')
  const name = path.split('/').pop() ?? path

  // Generated / vendored noise wins first — it must never be treated as source.
  if (GENERATED_PATH.test(path) || GENERATED_EXT.test(name) || GENERATED_NAME.test(name)) {
    return 'generated'
  }
  // Tests before source (a .cpp under tests/ is a test, not a feature source).
  if (TEST_PATH.test(path) || TEST_NAME.test(name)) return 'test'
  if (SOURCE_EXT.test(name)) return 'source'
  if (CONFIG_EXT.test(name) || CONFIG_NAME.test(name)) return 'config'
  return 'other'
}

/** Whether a file's hunks should be fed to the LLM sample (source/test only). */
export function includeInSample(category: FileCategory): boolean {
  return category === 'source' || category === 'test'
}

/** The top-level bucket of a path (first two segments) for the directory breakdown. */
export function dirBucket(rawPath: string): string {
  const parts = rawPath.trim().replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length <= 1) return '.'
  return parts.slice(0, Math.min(2, parts.length - 1)).join('/')
}
