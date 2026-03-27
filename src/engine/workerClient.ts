// Typed async wrapper for calling Stats Engine functions via Web Worker
// Components only ever call this — never import stats-engine.ts directly

let worker: Worker | null = null
let requestId = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL('./stats-engine.worker.ts', import.meta.url),
      { type: 'module' }
    )
    worker.onmessage = (e: MessageEvent) => {
      const { id, result, error } = e.data
      const p = pending.get(id)
      if (!p) return
      pending.delete(id)
      if (error) {
        p.reject(new Error(error))
      } else {
        p.resolve(result)
      }
    }
    worker.onerror = (e) => {
      // Reject all pending requests on worker error
      for (const [id, p] of pending) {
        p.reject(new Error(`Worker error: ${e.message}`))
        pending.delete(id)
      }
    }
  }
  return worker
}

/**
 * Run a Stats Engine function in the Web Worker.
 *
 * @param functionName - Name of the exported function in stats-engine.ts
 * @param args - Arguments to pass to the function
 * @returns Promise resolving to the typed result
 *
 * Usage:
 *   const result = await runAnalysis<TTestResult>('ttest', [groupA, groupB])
 */
export async function runAnalysis<T>(
  functionName: string,
  args: unknown[]
): Promise<T> {
  const id = ++requestId
  const w = getWorker()

  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject
    })
    w.postMessage({ id, functionName, args })
  })
}

/**
 * Terminate the worker. Call on app cleanup if needed.
 */
export function terminateWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
    // Reject all pending
    for (const [id, p] of pending) {
      p.reject(new Error('Worker terminated'))
      pending.delete(id)
    }
  }
}
