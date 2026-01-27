export type MetricStatus = 'pending' | 'failed' | 'ok';

export type MetricDisplay = {
  state: MetricStatus;
  label: string;
  value: number | null;
  reason: string | null;
};

type MetricInput = {
  status?: MetricStatus | null;
  value?: number | null;
  error?: string | null;
  pendingLabel?: string;
  emptyLabel?: string;
};

export const getMetricDisplay = (input: MetricInput): MetricDisplay => {
  const status = input.status ?? 'ok';
  const pendingLabel = input.pendingLabel ?? '正在解析';
  const emptyLabel = input.emptyLabel ?? '—';
  const reason = input.error ?? null;

  if (status === 'pending') {
    return { state: 'pending', label: pendingLabel, value: null, reason: null };
  }

  const value = typeof input.value === 'number' && Number.isFinite(input.value) ? input.value : null;
  if (status === 'failed' || value === null) {
    return { state: 'failed', label: emptyLabel, value: null, reason };
  }

  return { state: 'ok', label: String(value), value, reason: null };
};
