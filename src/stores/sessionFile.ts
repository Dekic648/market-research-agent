/**
 * Session file export/import — .mrst format.
 *
 * Export: JSON.stringify(all stores) → gzip → download
 * Import: read → decompress → validate schemaVersion → restore
 */

import { serializeStores, rehydrateAllStores } from './persistence'

const SCHEMA_VERSION = 1

interface SessionFilePayload {
  schemaVersion: number
  exportedAt: number
  stores: Record<string, unknown>
}

// ============================================================
// Export
// ============================================================

/**
 * Export current session as a .mrst file (gzipped JSON).
 * In a browser context, triggers a download. Returns the blob for testing.
 */
export async function exportSession(): Promise<Blob> {
  const payload: SessionFilePayload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    stores: serializeStores(),
  }

  const json = JSON.stringify(payload)
  const blob = new Blob([json], { type: 'application/json' })

  // Compress if CompressionStream is available (browser)
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('gzip')
    const writer = cs.writable.getWriter()
    const reader = cs.readable.getReader()

    writer.write(new TextEncoder().encode(json))
    writer.close()

    const chunks: Uint8Array[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    const totalLength = chunks.reduce((s, c) => s + c.length, 0)
    const merged = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    return new Blob([merged], { type: 'application/gzip' })
  }

  // Fallback: uncompressed JSON
  return blob
}

/**
 * Trigger a browser download of the session file.
 */
export function downloadSession(blob: Blob, filename?: string): void {
  const name = filename ?? `session_${new Date().toISOString().slice(0, 10)}.mrst`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

// ============================================================
// Import
// ============================================================

/**
 * Import a session from a .mrst file.
 * Validates schema version before restoring.
 */
export async function importSession(file: File): Promise<void> {
  let text: string

  // Try decompressing first
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('gzip')
      const writer = ds.writable.getWriter()
      const reader = ds.readable.getReader()

      const buffer = await file.arrayBuffer()
      writer.write(new Uint8Array(buffer))
      writer.close()

      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      const totalLength = chunks.reduce((s, c) => s + c.length, 0)
      const merged = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        merged.set(chunk, offset)
        offset += chunk.length
      }

      text = new TextDecoder().decode(merged)
    } catch {
      // Not gzipped — try reading as plain JSON
      text = await file.text()
    }
  } else {
    text = await file.text()
  }

  const payload = JSON.parse(text) as SessionFilePayload

  if (payload.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Incompatible session version: expected ${SCHEMA_VERSION}, got ${payload.schemaVersion}`
    )
  }

  rehydrateAllStores(payload.stores)
}
