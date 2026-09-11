declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  /** PDF.js worker protocol entry used by the same-page fallback. */
  export const WorkerMessageHandler: {
    readonly setup: (...args: readonly unknown[]) => unknown
  }
}
