/// <reference types="electron-vite/node" />

declare module '*.md?raw' {
  const content: string
  export default content
}
