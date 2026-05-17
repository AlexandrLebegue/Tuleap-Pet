export type FunctionDef = {
  /** Simple function name (e.g. `add`). */
  name: string
  /** Fully qualified name (e.g. `calc::add`, `Calculator::compute`). */
  qualifiedName: string
  /** Header line as written (return type + name + params). */
  signature: string
  /** Absolute file path. */
  filePath: string
  /** 1-based line where the signature/definition starts. */
  startLine: number
  /** 1-based line where the body ends (closing brace). */
  endLine: number
  /** Raw source text from signature start to closing brace. */
  body: string
  /** Containing namespace path (e.g. `calc`, `calc::detail`). Empty for global. */
  namespacePath: string
  /** Containing class/struct (e.g. `Calculator`). Empty if free function. */
  className: string
  /** True if extracted from a `.h/.hpp/.hxx` (header). */
  isHeader: boolean
  /** True if the definition body is present (vs. forward declaration). */
  hasBody: boolean
}

export type CallSite = {
  /** Function that *contains* the call. */
  callerQualifiedName: string
  /** File where the call site lives (absolute). */
  filePath: string
  /** Line of the call (1-based). */
  line: number
  /** Callee name as written at the call site (may be unqualified). */
  calleeRaw: string
}

export type ProjectIndex = {
  root: string
  /** Absolute paths of every C/C++ source/header file scanned. */
  files: string[]
  /** file path → list of function definitions extracted from it. */
  byFile: Map<string, FunctionDef[]>
  /** simple function name → list of definitions (overloads / multiple namespaces). */
  byName: Map<string, FunctionDef[]>
  /** Callsites grouped by *callee* simple name. */
  callersByCallee: Map<string, CallSite[]>
  /** For each function (by qualifiedName) → list of distinct callee simple names. */
  calleesByCaller: Map<string, string[]>
}

export type EnrichedContextEntry = {
  fn: FunctionDef
  /** 1 = direct callee/caller of target, 2 = depth-2, etc. */
  depth: number
}

export type EnrichedContext = {
  target: FunctionDef
  /** Associated header file (.h/.hpp pairing with the .c/.cpp where target lives). */
  header?: { filePath: string; content: string }
  /** Functions called by target, BFS-flattened, deduplicated by qualifiedName. */
  calleesTree: EnrichedContextEntry[]
  /** Functions that call target, BFS-flattened, deduplicated by qualifiedName. */
  callersTree: EnrichedContextEntry[]
  /** Rough estimate (chars / 4). */
  tokenEstimate: number
  /** True if any branch was truncated due to budget. */
  truncated: boolean
}
