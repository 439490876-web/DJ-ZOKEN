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
  title: string;
  artist: string;
  bpm: number;
  key: MusicalKey | string;
  energy: number; // 1-10 (Physical energy / Loudness)
  resonance: number; // 1-10 (Popularity / Sing-along factor)
  genre: string;
  duration: string; // MM:SS
  coverUrl?: string;
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

// Service Interfaces
export interface ITrackService {
  getAllTracks(): Promise<Track[]>;
  saveSetList(setList: SetList): Promise<void>;
}

// AI Types
export interface AISuggestion {
  trackId: string;
  reasoning: string;
  score?: number;
}