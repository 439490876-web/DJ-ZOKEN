/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { SetBuilder } from '../components/SetBuilder';

test('set builder renders header', () => {
  render(
    <SetBuilder
      setTracks={[]}
      onRemoveTrack={() => {}}
      onReorderTracks={() => {}}
      onAnalyzeTransition={async () => null}
      setType="prime"
      onGenreClick={() => {}}
      highlightedCategory={null}
      cutModes={{}}
      onToggleCutMode={() => {}}
    />
  );

  expect(screen.getByText('Current Set (当前编排)')).toBeTruthy();
});
