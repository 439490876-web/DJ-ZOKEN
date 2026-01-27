import { describe, expect, it } from 'vitest';

import { normalizePendingMetrics } from '../services/trackMetrics';

describe('normalizePendingMetrics', () => {
  it('clears energy when analysis pending', () => {
    const result = normalizePendingMetrics({ status: 'pending', energy: 5 });
    expect(result.energy).toBeNull();
  });

  it('clears resonance when heat pending', () => {
    const result = normalizePendingMetrics({ heatStatus: 'pending', resonance: 5 });
    expect(result.resonance).toBeNull();
  });

  it('clears both when failed', () => {
    const result = normalizePendingMetrics({ status: 'failed', heatStatus: 'failed', energy: 5, resonance: 5 });
    expect(result.energy).toBeNull();
    expect(result.resonance).toBeNull();
  });

  it('keeps values when ok', () => {
    const result = normalizePendingMetrics({ status: 'ok', heatStatus: 'ok', energy: 7, resonance: 8 });
    expect(result.energy).toBe(7);
    expect(result.resonance).toBe(8);
  });
});
