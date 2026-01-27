// Data Models

export enum MusicalKey {
  '1A' = '1A', '1B' = '1B',
  '2A' = '2A', '2B' = '2B',
  '3A' = '3A', '3B' = '3B',
  '4A' = '4A', '4B' = '4B',
  '5A' = '5A', '5B' = '5B',
  '6A' = '6A', '6B' = '6B',
  '7A' = '7A', '7B' = '7B',
  '8A' = '8A', '8B' = '8B',
  '9A' = '9A', '9B' = '9B',
  '10A' = '10A', '10B' = '10B',
  '11A' = '11A', '11B' = '11B',
  '12A' = '12A', '12B' = '12B',
}

export type SetType = 'warmup' | 'prime' | 'closing';

export interface Track {
  id: string;
  sourceId?: string; // 原始曲库 ID，用于同步更新
  folderIds?: string[];
  title: string;
  artist: string;
  bpm: number | null;
  key: MusicalKey | string | null;
  bpmSource?: string | null;
  keySource?: string | null;
  analysisWarnings?: string[] | null;
  energy: number | null; // 1-10 (Physical energy / Loudness)
  resonance: number | null; // 1-10 (Popularity / Sing-along factor)
  heatStatus?: 'pending' | 'ok' | 'failed';
  heatScoreRaw?: number | null;
  heatSource?: string | null;
  genre: string | null;
  duration: string; // MM:SS
  coverUrl?: string;
  filePath?: string | null;
  heatError?: string | null;
  status?: 'ok' | 'failed' | 'pending';
  error?: string | null;
  filenameDisplay?: string | null;
  fileSignature?: string | null;
}

export interface SetList {
  id: string;
  name: string;
  type: SetType;
  tracks: Track[];
  totalDuration: string;
}

export interface TransitionAnalysis {
  type: 'mix' | 'cut';
  reasoning: string;
}

export interface BridgeRecommendation {
  type: 'track' | 'technique';
  trackId?: string; // If AI suggests a track from library
  suggestionTitle: string; // e.g., "Echo Out" or Track Title
  reasoning: string;
}

// Service Interfaces
export interface ITrackService {
  getAllTracks(): Promise<Track[]>;
  getSetLists(): Promise<SetList[]>;
  saveSetList(setList: SetList): Promise<SetList>;
  deleteSetList(setListId: string): Promise<void>;
}

// AI Types
export interface AISuggestion {
  trackId: string;
  reasoning: string;
  score?: number;
}