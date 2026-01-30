export type ThemeMode = 'warm' | 'neutral';

const STORAGE_KEY = 'dj_theme_mode';

const normalizeTheme = (value: string | null): ThemeMode => {
  if (value === 'neutral') return 'neutral';
  return 'warm';
};

export const applyTheme = (theme: ThemeMode) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
};

export const getStoredTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'warm';
  const stored = normalizeTheme(window.localStorage.getItem(STORAGE_KEY));
  applyTheme(stored);
  return stored;
};

export const setStoredTheme = (theme: ThemeMode) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
};
