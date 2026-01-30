/* @vitest-environment jsdom */
import { render } from '@testing-library/react';
import { GlassCard } from '../components/GlassCard';
import { describe, it, expect } from 'vitest';

describe('Glass components', () => {
  it('renders glass card with base class', () => {
    const { getByTestId } = render(<GlassCard data-testid="glass" />);
    expect(getByTestId('glass').className).toContain('glass-card');
  });
});
