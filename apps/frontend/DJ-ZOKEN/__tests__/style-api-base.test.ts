import { describe, expect, it } from 'vitest';

import { buildStyleEndpoint, getStyleApiBase } from '../services/styleApi';

describe('styleApi base', () => {
  it('defaults to /style proxy when env not set', () => {
    const base = getStyleApiBase(undefined);
    expect(base).toBe('/style');
  });

  it('builds predict endpoint using proxy base', () => {
    const endpoint = buildStyleEndpoint('/style');
    expect(endpoint.startsWith('/style/predict?')).toBe(true);
  });
});
