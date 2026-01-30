/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { getStoredTheme, setStoredTheme } from '../services/themeStorage';

describe('themeStorage', () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = '';
    window.localStorage.clear();
  });

  it('persists theme and updates document dataset', () => {
    setStoredTheme('neutral');
    expect(getStoredTheme()).toBe('neutral');
    expect(document.documentElement.dataset.theme).toBe('neutral');
  });
});
