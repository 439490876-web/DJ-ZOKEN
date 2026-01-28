import { describe, expect, it } from 'vitest';

import { getHeatRefreshIds } from '../services/heatRefresh';

describe('getHeatRefreshIds', () => {
  it('returns ids for tracks with heat_model_mismatch and files', () => {
    const library = [
      { id: 'a', heatError: 'heat_model_mismatch', heatSource: 'pop_comment_v2' },
      { id: 'b', heatError: null, heatSource: 'v4-popcomment' },
      { id: 'c', heatError: 'heat_model_mismatch', heatSource: null }
    ];
    const localFileMap = {
      a: new File(['a'], 'a.mp3'),
      c: new File(['c'], 'c.mp3')
    } as Record<string, File>;

    const result = getHeatRefreshIds(library, localFileMap, 'v4-popcomment');
    expect(result).toEqual(['a', 'c']);
  });

  it('ignores tracks without local files or without mismatch', () => {
    const library = [
      { id: 'a', heatError: 'heat_model_mismatch', heatSource: 'pop_comment_v2' },
      { id: 'b', heatError: 'online_heat_required', heatSource: null }
    ];
    const localFileMap = {
      b: new File(['b'], 'b.mp3')
    } as Record<string, File>;

    const result = getHeatRefreshIds(library, localFileMap, 'v4-popcomment');
    expect(result).toEqual([]);
  });
});
