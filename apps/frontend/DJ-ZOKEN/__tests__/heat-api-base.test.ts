import { describe, it, expect } from 'vitest';
import { getHeatApiBase, buildIdentifyEndpoints, shouldRetryWithProxy, buildHeatCacheKey } from '../services/heatApi';

describe('getHeatApiBase', () => {
  it('uses default 127.0.0.1:8002 when env missing', () => {
    expect(getHeatApiBase()).toBe('http://127.0.0.1:8002');
  });

  it('uses provided env value', () => {
    expect(getHeatApiBase('http://localhost:9999')).toBe('http://localhost:9999');
  });
});

describe('buildIdentifyEndpoints', () => {
  it('builds direct and proxy endpoints', () => {
    const result = buildIdentifyEndpoints('http://127.0.0.1:8002');
    expect(result.direct).toBe('http://127.0.0.1:8002/identify');
    expect(result.proxy).toBe('/heat/identify');
  });
});

describe('shouldRetryWithProxy', () => {
  it('returns true for Failed to fetch', () => {
    const err = new TypeError('Failed to fetch');
    expect(shouldRetryWithProxy(err)).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(shouldRetryWithProxy(new Error('boom'))).toBe(false);
  });
});


describe('buildHeatCacheKey', () => {
  it('includes model version in key', () => {
    const fakeFile = { name: 'song.mp3', size: 1234, lastModified: 1700000000000 } as File;
    const key = buildHeatCacheKey(fakeFile);
    expect(key).toContain('song.mp3:1234:1700000000000');
    expect(key).toContain('heat=v4-popcomment');
  });
});
