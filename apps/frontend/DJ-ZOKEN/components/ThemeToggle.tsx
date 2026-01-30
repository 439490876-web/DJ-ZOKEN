import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { getStoredTheme, setStoredTheme, ThemeMode } from '../services/themeStorage';
import { SegmentedControl } from './SegmentedControl';

export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = React.useState<ThemeMode>(() => getStoredTheme());

  const handleSetTheme = (value: ThemeMode) => {
    setTheme(value);
    setStoredTheme(value);
  };

  return (
    <SegmentedControl
      options={[
        { id: 'warm', label: 'Warm Glass', icon: <Sun className="w-3 h-3" /> },
        { id: 'neutral', label: 'Neutral Smoke', icon: <Moon className="w-3 h-3" /> },
      ]}
      value={theme}
      onChange={(value) => handleSetTheme(value as ThemeMode)}
    />
  );
};
