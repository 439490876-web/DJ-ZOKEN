const resolveApiBase = (value: string): string => {
  const trimmed = (value || '').trim();
  if (!trimmed || typeof window === 'undefined') return trimmed;
  try {
    const url = new URL(trimmed, window.location.origin);
    const host = window.location.hostname;
    const normalizedHost = host === 'localhost' ? '127.0.0.1' : host;
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (normalizedHost && isLocal) {
      url.hostname = normalizedHost;
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return trimmed.replace(/\/$/, '');
  }
};

export const getStyleApiBase = (envValue?: string): string => {
  const fallback = '/style';
  const value = (envValue || '').trim();
  if (!value) return fallback;
  return resolveApiBase(value);
};

export const buildStyleEndpoint = (base: string): string => {
  const trimmed = (base || '').replace(/\/$/, '');
  return `${trimmed}/predict?segment_mode=drop&drop_strategy=energy&drop_seconds=20&drop_candidate_top_n=2`;
};
