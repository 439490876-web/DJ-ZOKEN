/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { Button, Panel, Badge } from '../components/ui';

test('renders ui primitives with base classes', () => {
  render(
    <Panel data-testid="panel">
      <Button>Save</Button>
      <Badge>Hot</Badge>
    </Panel>
  );
  expect(screen.getByTestId('panel')).toBeTruthy();
  expect(screen.getByText('Save')).toBeTruthy();
  expect(screen.getByText('Hot')).toBeTruthy();
});
