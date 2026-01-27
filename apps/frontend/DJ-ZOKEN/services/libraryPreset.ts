import { Track } from '../types';

export const purgePresetLibrary = (library: Track[]): { library: Track[]; removedPreset: boolean } => {
  if (!Array.isArray(library) || library.length === 0) {
    return { library: [], removedPreset: false };
  }
  const hasUserTrack = library.some(track => Boolean(track.fileSignature) || Boolean(track.filePath));
  if (hasUserTrack) {
    return { library, removedPreset: false };
  }
  return { library: [], removedPreset: true };
};
