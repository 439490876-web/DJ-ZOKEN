export const HEAT_MODEL_VERSION = 'v4-popcomment';
export const DEFAULT_HEAT_API = 'http://127.0.0.1:8002';

type IdentifyEndpoints = {
  direct: string;
  proxy: string;
};

export const getHeatApiBase = (value?: string | null): string => {
  const trimmed = String(value ?? '').trim();
  return trimmed || DEFAULT_HEAT_API;
};

export const buildIdentifyEndpoints = (base: string): IdentifyEndpoints => {
  const normalized = (base || '').replace(/\/$/, '');
  return {
    direct: `${normalized}/identify`,
    proxy: '/heat/identify'
  };
};

export const shouldRetryWithProxy = (error: unknown): boolean => {
  if (!error) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  if (error instanceof TypeError && /fetch/i.test(error.message)) return true;
  const message = typeof error === 'string' ? error : (error as { message?: string } | null)?.message;
  return typeof message === 'string' && /failed to fetch/i.test(message);
};

export const buildHeatCacheKey = (file: File): string => {
  return `${file.name}:${file.size}:${file.lastModified}:heat=${HEAT_MODEL_VERSION}`;
};
