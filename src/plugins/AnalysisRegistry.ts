/**
 * AnalysisRegistry — plugins self-register here.
 *
 * query() returns runnable plugins for a given CapabilitySet.
 * Knows no plugin by name — pure capability matching.
 */

import type { AnalysisPlugin, CapabilitySet } from './types'

const plugins: AnalysisPlugin[] = []

export const AnalysisRegistry = {
  /** Register a plugin. Called at import time by each plugin module. */
  register(plugin: AnalysisPlugin): void {
    // Prevent duplicate registration
    if (plugins.some((p) => p.id === plugin.id)) return
    plugins.push(plugin)
  },

  /**
   * Query for runnable plugins given a set of data capabilities.
   * Returns plugins whose `requires` are all satisfied, ordered by priority.
   */
  query(capabilities: CapabilitySet): AnalysisPlugin[] {
    return plugins
      .filter((plugin) =>
        plugin.requires.every((req) => capabilities.has(req))
      )
      .sort((a, b) => a.priority - b.priority)
  },

  /**
   * Query with dependency resolution — returns plugins in executable order.
   * Plugins whose dependsOn[] are not satisfied are excluded.
   */
  queryOrdered(capabilities: CapabilitySet): AnalysisPlugin[] {
    const runnable = this.query(capabilities)
    const runnableIds = new Set(runnable.map((p) => p.id))

    // Filter out plugins whose dependencies aren't runnable
    const resolved = runnable.filter((plugin) => {
      if (!plugin.dependsOn || plugin.dependsOn.length === 0) return true
      return plugin.dependsOn.every((depId) => runnableIds.has(depId))
    })

    // Topological sort by dependencies
    return topologicalSort(resolved)
  },

  /** Get a plugin by ID */
  get(id: string): AnalysisPlugin | undefined {
    return plugins.find((p) => p.id === id)
  },

  /** Total registered plugins */
  get count(): number {
    return plugins.length
  },

  /** Reset — for testing only */
  _reset(): void {
    plugins.length = 0
  },
}

/** Simple topological sort — plugins with no deps come first */
function topologicalSort(plugins: AnalysisPlugin[]): AnalysisPlugin[] {
  const result: AnalysisPlugin[] = []
  const visited = new Set<string>()
  const pluginMap = new Map(plugins.map((p) => [p.id, p]))

  function visit(plugin: AnalysisPlugin) {
    if (visited.has(plugin.id)) return
    visited.add(plugin.id)

    // Visit dependencies first
    if (plugin.dependsOn) {
      for (const depId of plugin.dependsOn) {
        const dep = pluginMap.get(depId)
        if (dep) visit(dep)
      }
    }

    result.push(plugin)
  }

  for (const plugin of plugins) {
    visit(plugin)
  }

  return result
}
