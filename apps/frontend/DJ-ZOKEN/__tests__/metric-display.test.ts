import { describe, expect, it } from 'vitest';

import { getMetricDisplay } from '../services/metricDisplay';

describe('getMetricDisplay', () => {
  it('returns pending state with pending label', () => {
    const result = getMetricDisplay({ status: 'pending', value: 5, error: null });
    expect(result.state).toBe('pending');
    expect(result.label).toBe('正在解析');
    expect(result.value).toBeNull();
  });

  it('returns failed state with empty label and reason', () => {
    const result = getMetricDisplay({ status: 'failed', value: 5, error: 'boom' });
    expect(result.state).toBe('failed');
    expect(result.label).toBe('—');
    expect(result.reason).toBe('boom');
  });

  it('returns ok state when status ok and value is finite', () => {
    const result = getMetricDisplay({ status: 'ok', value: 7, error: null });
    expect(result.state).toBe('ok');
    expect(result.label).toBe('7');
    expect(result.value).toBe(7);
  });

  it('returns failed when status ok but value invalid', () => {
    const result = getMetricDisplay({ status: 'ok', value: NaN, error: 'no value' });
    expect(result.state).toBe('failed');
    expect(result.label).toBe('—');
    expect(result.reason).toBe('no value');
  });
});
