import { PassThrough } from 'node:stream'
import type { H3Event } from 'h3'
import { EXPORT_MIME, type ExportFormat } from '#shared/export-format'
import type { ExportSink } from '../query/export-service'

/**
 * Streams an export as a download. The job writes through a sink with back-pressure; a failure
 * before the first byte is thrown (so it becomes a normal error response), one after it ends the
 * connection. A client that goes away flips `aborted`, which the job checks between batches.
 */
export async function sendExport(
  event: H3Event,
  filename: string,
  format: ExportFormat,
  job: (sink: ExportSink) => Promise<unknown>,
): Promise<unknown> {
  const out = new PassThrough()
  let aborted = false
  event.node.res.on('close', () => {
    aborted = true
    out.destroy()
  })
  let resolveFirst!: () => void
  const first = new Promise<void>((resolve) => (resolveFirst = resolve))

  const sink: ExportSink = {
    aborted: () => aborted,
    write(chunk) {
      if (aborted) return Promise.resolve()
      const ok = out.write(chunk)
      resolveFirst()
      return ok ? Promise.resolve() : new Promise<void>((r) => out.once('drain', () => r()))
    },
  }
  const done = job(sink).then(
    () => {
      resolveFirst()
      out.end()
    },
    (err) => {
      resolveFirst()
      out.destroy(err instanceof Error ? err : new Error(String(err)))
      throw err
    },
  )
  // Before the first byte a failure is a real error response; afterwards the stream just breaks.
  done.catch(() => {})
  let failure: unknown = null
  await Promise.race([first, done.catch((e) => (failure = e))])
  if (failure) throw failure

  setHeader(event, 'Content-Type', EXPORT_MIME[format])
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename.replace(/[^\w.-]+/g, '_')}"`)
  setHeader(event, 'Cache-Control', 'no-store')
  return sendStream(event, out)
}
