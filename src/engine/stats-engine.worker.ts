// Web Worker wrapper for the Stats Engine
// All analysis runs off the main thread via this worker

import * as StatsEngine from './stats-engine'

self.onmessage = (e: MessageEvent) => {
  const { id, functionName, args } = e.data
  try {
    const fn = (StatsEngine as Record<string, unknown>)[functionName]
    if (typeof fn !== 'function') {
      throw new Error(`Unknown function: ${functionName}`)
    }
    const result = (fn as (...a: unknown[]) => unknown)(...args)
    self.postMessage({ id, result })
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message })
  }
}
