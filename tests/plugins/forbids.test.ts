/**
 * Tests for the forbids mechanism and its application to plugins.
 */
import { describe, it, expect } from 'vitest'
import { AnalysisRegistry } from '../../src/plugins/AnalysisRegistry'
import type { CapabilitySet } from '../../src/plugins/types'

// Register all plugins
import '../../src/plugins/FrequencyPlugin'
import '../../src/plugins/CrosstabPlugin'
import '../../src/plugins/SignificancePlugin'
import '../../src/plugins/PostHocPlugin'
import '../../src/plugins/ReliabilityPlugin'
import '../../src/plugins/FactorPlugin'
import '../../src/plugins/RegressionPlugin'
import '../../src/plugins/DriverPlugin'
import '../../src/plugins/CorrelationPlugin'
import '../../src/plugins/PointBiserialPlugin'
import '../../src/plugins/SegmentProfilePlugin'

// ============================================================
// Fix 1: forbids mechanism in AnalysisRegistry.query()
// ============================================================

describe('AnalysisRegistry forbids mechanism', () => {
  it('excludes plugin when forbids capability is present', () => {
    // RegressionPlugin forbids: ['binary']
    const caps: CapabilitySet = new Set(['continuous', 'binary', 'n>30'])
    const plugins = AnalysisRegistry.query(caps)
    const ids = plugins.map((p) => p.id)

    expect(ids).not.toContain('regression')
    expect(ids).not.toContain('driver_analysis')
  })

  it('includes plugin when forbids capability is absent', () => {
    const caps: CapabilitySet = new Set(['continuous', 'n>30'])
    const plugins = AnalysisRegistry.query(caps)
    const ids = plugins.map((p) => p.id)

    expect(ids).toContain('regression')
  })

  it('existing plugins with no forbids field are unaffected', () => {
    // FrequencyPlugin has no forbids
    const caps: CapabilitySet = new Set(['ordinal'])
    const plugins = AnalysisRegistry.query(caps)
    const ids = plugins.map((p) => p.id)

    expect(ids).toContain('frequency')
  })

  it('forbids is backwards compatible — undefined forbids treated as no exclusion', () => {
    // CorrelationPlugin has no forbids field
    const caps: CapabilitySet = new Set(['continuous', 'binary'])
    const plugins = AnalysisRegistry.query(caps)
    const ids = plugins.map((p) => p.id)

    expect(ids).toContain('correlation')
  })
})

// ============================================================
// Fix 2: forbids applied to specific plugins
// ============================================================

describe('RegressionPlugin forbids binary', () => {
  it('not returned when capability set includes binary', () => {
    const caps: CapabilitySet = new Set(['continuous', 'binary', 'n>30'])
    const plugins = AnalysisRegistry.query(caps)
    expect(plugins.some((p) => p.id === 'regression')).toBe(false)
  })

  it('returned when capability set does not include binary', () => {
    const caps: CapabilitySet = new Set(['continuous', 'n>30'])
    const plugins = AnalysisRegistry.query(caps)
    expect(plugins.some((p) => p.id === 'regression')).toBe(true)
  })
})

describe('SignificancePlugin forbids binary', () => {
  it('not returned when capability set includes binary', () => {
    const caps: CapabilitySet = new Set(['ordinal', 'segment', 'binary'])
    const plugins = AnalysisRegistry.query(caps)
    expect(plugins.some((p) => p.id === 'kw_significance')).toBe(false)
  })

  it('returned when capability set does not include binary', () => {
    const caps: CapabilitySet = new Set(['ordinal', 'segment', 'n>30'])
    const plugins = AnalysisRegistry.query(caps)
    expect(plugins.some((p) => p.id === 'kw_significance')).toBe(true)
  })
})

describe('PostHocPlugin forbids binary', () => {
  it('not returned when binary is present', () => {
    const caps: CapabilitySet = new Set(['ordinal', 'segment', 'binary'])
    const plugins = AnalysisRegistry.query(caps)
    expect(plugins.some((p) => p.id === 'posthoc')).toBe(false)
  })
})

describe('DriverPlugin forbids binary', () => {
  it('not returned when binary is present', () => {
    const caps: CapabilitySet = new Set(['continuous', 'binary', 'n>30'])
    const plugins = AnalysisRegistry.query(caps)
    expect(plugins.some((p) => p.id === 'driver_analysis')).toBe(false)
  })
})
