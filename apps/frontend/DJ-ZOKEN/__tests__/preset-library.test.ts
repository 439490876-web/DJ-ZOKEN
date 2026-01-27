import { describe, it, expect } from 'vitest';
import { purgePresetLibrary } from '../services/libraryPreset';

describe('purgePresetLibrary', () => {
  it('removes preset tracks when none have signature or filePath', () => {
    const input = [
      { id: 'demo-1', title: 'Demo', artist: 'Test' },
      { id: 'demo-2', title: 'Demo2', artist: 'Test' }
    ] as any;
    const result = purgePresetLibrary(input);
    expect(result.removedPreset).toBe(true);
    expect(result.library).toEqual([]);
  });

  it('keeps library when any track has fileSignature', () => {
    const input = [
      { id: 'local-1', title: 'Real', artist: 'User', fileSignature: 'sig' },
      { id: 'demo-2', title: 'Demo2', artist: 'Test' }
    ] as any;
    const result = purgePresetLibrary(input);
    expect(result.removedPreset).toBe(false);
    expect(result.library).toEqual(input);
  });

  it('keeps library when any track has filePath', () => {
    const input = [
      { id: 'local-1', title: 'Real', artist: 'User', filePath: '/path/song.mp3' }
    ] as any;
    const result = purgePresetLibrary(input);
    expect(result.removedPreset).toBe(false);
    expect(result.library).toEqual(input);
  });

  it('keeps empty library', () => {
    const result = purgePresetLibrary([] as any);
    expect(result.removedPreset).toBe(false);
    expect(result.library).toEqual([]);
  });
});
