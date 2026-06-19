export type {
  FunctionDef,
  CallSite,
  ProjectIndex,
  EnrichedContext,
  EnrichedContextEntry
} from './types'

export { parseFile, stripCommentsAndStrings, extractIncludes, isHeaderPath } from './parser'
export { extractCallees, extractCallSites } from './callExtractor'
export { isSourceFile, isHeaderFile, isCppFile, findCounterpart } from './pairing'
export { listCppFiles, findFilesByBasename, CPP_SKIP_DIRS } from './fs-scan'
export { buildProjectIndex, findFunction } from './projectIndex'
export type { IndexOptions } from './projectIndex'
export { buildContext, renderContext } from './contextBuilder'
export type { ContextOptions } from './contextBuilder'
