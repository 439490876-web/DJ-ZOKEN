import { Track, MusicalKey, ITrackService, SetList } from '../types';

// Helper: Genre Grouping Logic (Shared)
export const getGenreCategory = (genre: string | null = ''): string => {
    const g = (genre || '').toLowerCase();
    if (!g) return 'Other';
    
    if (g.includes('house') || g.includes('minimal') || g.includes('acid') || g === 'progressive' || g.includes('disco')) return 'House / Disco';
    if (g.includes('techno')) return 'Techno';
    if (g.includes('trance') || g.includes('psytrance')) return 'Trance';
    if (g.includes('hip hop') || g.includes('rap') || g.includes('trap') || g.includes('r&b') || g.includes('afrobeat') || g.includes('dancehall')) return 'Hip Hop / R&B';
    if (g.includes('dnb') || g.includes('drum & bass') || g.includes('dubstep') || g.includes('bass') || g.includes('ukg') || g.includes('garage')) return 'Bass / DnB';
    if (g.includes('latin') || g.includes('reggaeton') || g.includes('moombahton')) return 'Latin';
    if (g.includes('rock') || g.includes('grunge') || g.includes('metal') || g.includes('punk') || g.includes('indie')) return 'Rock / Alt';
    if (g.includes('jazz') || g.includes('lo-fi') || g.includes('ambient') || g.includes('lounge') || g.includes('trip hop') || g.includes('downtempo')) return 'Chill / Jazz';
    if (g.includes('big room') || g.includes('hardstyle') || g.includes('hardcore') || g.includes('festival')) return 'Hard / Festival';
    if (g.includes('pop') || g.includes('k-pop') || g.includes('dance')) return 'Pop / Dance';
    if (g.includes('tool') || g.includes('fx') || g.includes('sample') || g.includes('loop') || g.includes('acapella')) return 'Tools';
    
    return 'Other';
};

// Mock Data - disabled (no preset tracks)
const MOCK_LIBRARY: Track[] = [];

/**
 * Service to handle data interactions.
 * Replace the contents of these functions to connect to your real API.
 */
class TrackService implements ITrackService {
  
  // Simulate network delay
  private async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getAllTracks(): Promise<Track[]> {
    await this.delay(500); // Simulate API latency
    return [...MOCK_LIBRARY];
  }

  async getSetLists(): Promise<SetList[]> {
    const response = await fetch('/api/setlists');
    if (!response.ok) {
      throw new Error(`Failed to load setlists (${response.status})`);
    }
    const data = await response.json();
    if (data && Array.isArray(data.setlists)) {
      return data.setlists as SetList[];
    }
    return [];
  }

  async saveSetList(setList: SetList): Promise<SetList> {
    const response = await fetch('/api/setlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(setList),
    });
    if (!response.ok) {
      throw new Error(`Failed to save setlist (${response.status})`);
    }
    const data = await response.json();
    if (data && data.setlist) {
      return data.setlist as SetList;
    }
    return setList;
  }

  async deleteSetList(setListId: string): Promise<void> {
    const response = await fetch(`/api/setlists/${encodeURIComponent(setListId)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete setlist (${response.status})`);
    }
  }
}

export const trackService = new TrackService();
