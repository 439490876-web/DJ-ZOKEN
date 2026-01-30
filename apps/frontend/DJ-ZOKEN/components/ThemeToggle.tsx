import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { getStoredTheme, setStoredTheme, ThemeMode } from '../services/themeStorage';

const themeLabels: Record<ThemeMode, string> = {
  warm: 'Warm Glass',
  neutral: 'Neutral Smoke',
};

export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = React.useState<ThemeMode>(() => getStoredTheme());

  const handleSetTheme = (value: ThemeMode) => {
    setTheme(value);
    setStoredTheme(value);
  };

  return (
    <div className="theme-toggle" role="group" aria-label="Theme toggle">
      <button
        type="button"
        onClick={() => handleSetTheme('warm')}
        className={theme === 'warm' ? 'active' : ''}
      >
        <span className="flex items-center gap-1">
          <Sun className="w-3 h-3" /> {themeLabels.warm}
        </span>
      </button>
      <button
        type="button"
        onClick={() => handleSetTheme('neutral')}
        className={theme === 'neutral' ? 'active' : ''}
      >
        <span className="flex items-center gap-1">
          <Moon className="w-3 h-3" /> {themeLabels.neutral}
        </span>
      </button>
    </div>
  );
};
