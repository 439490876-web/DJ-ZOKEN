import { describe, expect, it } from 'vitest';

import { normalizeHeatSource, normalizePendingMetrics } from '../services/trackMetrics';

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

describe('normalizeHeatSource', () => {
  it('clears stale v2 heat metadata and marks pending', () => {
    const result = normalizeHeatSource({
      heatSource: 'pop_comment_v2',
      heatScoreRaw: 6.5,
      heatScore: 7,
      resonance: 7,
      heatStatus: 'ok'
    }, 'v4-popcomment');
    expect(result.heatSource).toBeNull();
    expect(result.heatScoreRaw).toBeNull();
    expect(result.heatScore).toBeNull();
    expect(result.resonance).toBeNull();
    expect(result.heatStatus).toBe('pending');
    expect(result.heatError).toBe('heat_model_mismatch');
  });

  it('keeps v4 heat metadata', () => {
    const result = normalizeHeatSource({
      heatSource: 'v4-popcomment',
      heatScoreRaw: 8.1,
      heatScore: 8,
      resonance: 8,
      heatStatus: 'ok'
    }, 'v4-popcomment');
    expect(result.heatSource).toBe('v4-popcomment');
    expect(result.heatScoreRaw).toBe(8.1);
    expect(result.heatScore).toBe(8);
    expect(result.resonance).toBe(8);
    expect(result.heatStatus).toBe('ok');
  });
});
