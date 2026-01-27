import { describe, test, expect } from 'vitest';
import { formatHeatMeta } from '../services/heatMeta';


describe('formatHeatMeta', () => {
  test('formats heat source and raw score', () => {
    const result = formatHeatMeta({ heatSource: 'pop_comment_v2', heatScoreRaw: 3.59 });
    expect(result).toBe('source=pop_comment_v2, raw=3.59');
  });

  test('handles missing data', () => {
    const result = formatHeatMeta({ heatSource: null, heatScoreRaw: null });
    expect(result).toBe('source=—, raw=—');
  });
});
