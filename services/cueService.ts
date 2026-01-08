import { Track, SetType } from '../types';
import { getGenreCategory } from './trackService';

export interface CueStrategy {
    estimatedSeconds: number;
    formattedDuration: string;
    label: string; // e.g., "Quick Mix", "Full Play"
    description: string;
    type: 'quick' | 'extended' | 'standard' | 'full';
}

// Helper: Parse "MM:SS" to seconds
export const parseDurationToSeconds = (durationStr: string): number => {
    if (!durationStr) return 0;
    const parts = durationStr.split(':');
    if (parts.length !== 2) return 0;
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
};

// Helper: Format seconds to "MM:SS"
export const formatSecondsToDuration = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const calculateCueStrategy = (track: Track, setType: SetType): CueStrategy => {
    const totalSeconds = parseDurationToSeconds(track.duration);
    const genreCat = getGenreCategory(track.genre);
    
    // Default: Standard Mix (75% of track)
    let estimated = totalSeconds * 0.75;
    let label = "标准混音";
    let type: CueStrategy['type'] = 'standard';
    let description = "Intro/Outro 叠歌";

    // 1. GENRE BASELINE
    // Hip-Hop / Bass / Pop usually played shorter (Verse-Chorus-Verse-Chorus)
    if (['Hip Hop / R&B', 'Pop / Dance', 'Bass / DnB', 'Latin'].includes(genreCat)) {
        estimated = Math.min(totalSeconds, 150); // Cap at 2:30 initially
        label = "短接";
        type = 'quick';
        description = "V1-C1-V2-C2 切歌";
    }

    // 2. SET PHASE & RESONANCE MODIFIERS

    // --- WARM UP ---
    if (setType === 'warmup') {
        // Warmup: Let tracks breathe, especially House/Techno
        if (['House / Disco', 'Techno', 'Trance', 'Chill / Jazz'].includes(genreCat)) {
            estimated = Math.max(totalSeconds * 0.85, 210); // Min 3:30
            estimated = Math.min(estimated, totalSeconds); // Don't exceed total
            label = "长混音";
            type = 'extended';
            description = "铺垫氛围，长Blend";
        } else {
            // Even pop songs played longer in warmup
            estimated = totalSeconds * 0.8; 
            label = "舒缓接歌";
            type = 'standard';
        }
    }

    // --- PRIME TIME ---
    else if (setType === 'prime') {
        // Scenario: High Resonance Anthem (Let it play!)
        if (track.resonance >= 8) {
            estimated = Math.min(totalSeconds * 0.9, 240); // Max 4:00, usually play 2nd drop
            label = "金曲延展";
            type = 'extended';
            description = "高共鸣：播放至第二段高潮";
            
            // Special case: Very short songs (Punk/Pop) play full
            if (totalSeconds < 180) {
                 estimated = totalSeconds;
                 label = "完整播放";
                 type = 'full';
            }
        } 
        // Scenario: Low Resonance / Tool (Quick Mix)
        else if (track.resonance < 7) {
            // Keep energy moving
            estimated = Math.min(estimated, 135); // Max 2:15
            label = "快速过歌";
            type = 'quick';
            description = "功能性铺垫，一高潮即走";
        }
    }

    // --- CLOSING ---
    else if (setType === 'closing') {
        estimated = totalSeconds * 0.95; // Almost full
        label = "完整呈现";
        type = 'full';
        description = "情感沉淀，保留尾奏";
    }

    // Final Sanity Checks
    if (estimated > totalSeconds) estimated = totalSeconds;
    if (estimated < 60) {
        estimated = Math.min(60, totalSeconds);
    } // Minimum 1 min play (unless it's a tool/loop, logic excluded for brevity)

    return {
        estimatedSeconds: Math.floor(estimated),
        formattedDuration: formatSecondsToDuration(estimated),
        label,
        description,
        type
    };
};

export const calculateTotalSetDuration = (tracks: Track[], setType: SetType): string => {
    const totalSeconds = tracks.reduce((acc, track) => {
        return acc + calculateCueStrategy(track, setType).estimatedSeconds;
    }, 0);
    return formatSecondsToDuration(totalSeconds);
};
