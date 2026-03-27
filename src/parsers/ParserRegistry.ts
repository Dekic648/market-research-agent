/**
 * ParserRegistry — holds paste/import adapters and dispatches incoming raw
 * text to the first adapter that can handle it.
 *
 * Usage:
 *   import { ParserRegistry } from './ParserRegistry'
 *   const data = ParserRegistry.parse(clipboardText)
 */

import type { PastedData } from './adapters/PasteGridAdapter'

// Re-export the shared types so consumers can import from one place
export type { ParsedColumn, PastedData } from './adapters/PasteGridAdapter'

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface Adapter {
  /** Return true if this adapter can parse the given raw input. */
  canHandle(raw: string): boolean
  /** Parse raw input into structured PastedData. */
  parse(raw: string): PastedData
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const adapters: Adapter[] = []

export const ParserRegistry = {
  /** Register an adapter. Later registrations are checked first (LIFO). */
  register(adapter: Adapter): void {
    adapters.push(adapter)
  },

  /** Parse raw text by delegating to the first matching adapter. */
  parse(raw: string): PastedData {
    for (const adapter of adapters) {
      if (adapter.canHandle(raw)) return adapter.parse(raw)
    }
    throw new Error('No adapter can handle this data format')
  },

  /** Visible for testing — returns the current adapter count. */
  get adapterCount(): number {
    return adapters.length
  },
}

// ---------------------------------------------------------------------------
// Auto-register the built-in PasteGridAdapter
// ---------------------------------------------------------------------------

import { PasteGridAdapter } from './adapters/PasteGridAdapter'
ParserRegistry.register(PasteGridAdapter)
