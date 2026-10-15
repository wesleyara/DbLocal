// Monaco is imported through its package exports (`./*` maps to `esm/vs/*.js`).
declare module 'monaco-editor/editor/editor.main' {
  export * from 'monaco-editor'
}
declare module 'monaco-editor/editor/editor.worker?worker' {
  const Worker: new () => Worker
  export default Worker
}
