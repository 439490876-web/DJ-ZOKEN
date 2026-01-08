import { Track, SetType } from '../types';

export type StrictnessLevel = 'strict' | 'standard' | 'loose';
export type Severity = 'critical' | 'warning' | 'info' | 'success';
export type IssueType = 'harmonic' | 'bpm' | 'energy' | 'genre' | 'flow' | 'meta';

export interface SetIssue {
    id: string;
    trackId: string;
    severity: Severity;
    message: string;
    type: IssueType;
}

// Helper to parse Camelot keys (e.g. "11B", "2A")
export const parseKey = (key: string) => {
    const match = key.match(/^(\d+)([AB])$/);
    if (!match) return null;
    return { num: parseInt(match[1], 10), letter: match[2] };
};

export const calculateHarmonicStatus = (keyA: string, keyB: string, strictness: StrictnessLevel): 'exact' | 'compatible' | 'clash' => {
    if (keyA === keyB) return 'exact';
    
    const k1 = parseKey(keyA);
    const k2 = parseKey(keyB);
    
    if (!k1 || !k2) return 'clash'; 

    const numDiff = Math.abs(k1.num - k2.num);
    const circleDiff = Math.min(numDiff, 12 - numDiff);

    if (circleDiff === 0) {
        if (k1.letter === k2.letter) return 'exact';
        return 'compatible'; // Relative Major/Minor
    }

    if (circleDiff === 1) {
        if (strictness === 'strict') return 'clash';
        return 'compatible'; // Adjacent Key
    }

    if (circleDiff === 2) {
        if (strictness === 'loose') return 'compatible'; // Energy Boost
    }

    return 'clash';
};

export const analyzeTrackIssues = (
    track: Track, 
    index: number, 
    allTracks: Track[], 
    setType: SetType, 
    strictness: StrictnessLevel
): SetIssue[] => {
    const issues: SetIssue[] = [];
    const prevTrack = index > 0 ? allTracks[index - 1] : null;

    // 1. HARMONIC ANALYSIS
    if (prevTrack) {
        const status = calculateHarmonicStatus(prevTrack.key, track.key, strictness);
        if (status === 'clash') {
             issues.push({
                 id: `harmonic-${index}`,
                 trackId: track.id,
                 severity: 'critical',
                 message: `调性冲突 (${prevTrack.key} -> ${track.key})`,
                 type: 'harmonic'
             });
        }
    }

    // 2. BPM ANALYSIS
    if (prevTrack) {
        const bpmDiff = track.bpm - prevTrack.bpm;
        const isDoubleTime = Math.abs(prevTrack.bpm - track.bpm * 2) <= 5 || Math.abs(prevTrack.bpm * 2 - track.bpm) <= 5;
        const isBpmClose = Math.abs(bpmDiff) <= 6; // Standard mixing range +/- 6%

        if (!isBpmClose && !isDoubleTime) {
            issues.push({
                id: `bpm-${index}`,
                trackId: track.id,
                severity: 'warning',
                message: `BPM 差异过大 (${prevTrack.bpm} -> ${track.bpm})`,
                type: 'bpm'
            });
        }
    }

    // 3. ENERGY FLOW
    if (prevTrack) {
        const energyDiff = track.energy - prevTrack.energy;
        if (energyDiff >= 5) {
             issues.push({ 
                id: `energy-jump-${index}`,
                trackId: track.id,
                severity: 'warning', 
                message: `能量骤增 (+${energyDiff})`, 
                type: 'energy' 
            });
        } else if (energyDiff <= -5) {
             issues.push({ 
                id: `energy-drop-${index}`,
                trackId: track.id,
                severity: 'info', 
                message: `能量骤降 (${energyDiff})`, 
                type: 'energy' 
            });
        }
    }

    // 4. ENERGY DRAIN (Consecutive Descending)
    if (index >= 2) {
        const tMinus1 = allTracks[index - 1];
        const tMinus2 = allTracks[index - 2];
        // Check pattern: High -> Med -> Low
        if (tMinus2.energy > tMinus1.energy && tMinus1.energy > track.energy) {
            const isClosing = setType === 'closing';
            // Only flag if the drop is significant overall or strictly descending
            issues.push({ 
                id: `drain-${index}`,
                trackId: track.id,
                severity: isClosing ? 'info' : 'warning', 
                message: '连续能量衰减', 
                type: 'flow' 
            });
        }
    }

    // 5. ROLLERCOASTER (V-Shape or A-Shape within 3 tracks)
    if (index >= 2) {
        const prev1 = allTracks[index - 1];
        const prev2 = allTracks[index - 2];
        const diff1 = track.energy - prev1.energy;     // Current transition
        const diff2 = prev1.energy - prev2.energy;     // Previous transition

        // If direction flips (Up then Down OR Down then Up) AND magnitude is significant (>=3)
        if ((diff1 > 0) !== (diff2 > 0) && Math.abs(diff1) >= 3 && Math.abs(diff2) >= 3) {
            issues.push({ 
                id: `rollercoaster-${index}`,
                trackId: track.id,
                severity: 'warning', // Changed to warning to be less aggressive
                message: '能量波动过大 (过山车)', 
                type: 'flow' 
            });
        }
    }

    // 6. FLATNESS (4 tracks with same or minimal energy change)
    if (index >= 3) {
        const window = [track, allTracks[index-1], allTracks[index-2], allTracks[index-3]];
        const energies = window.map(t => t.energy);
        const max = Math.max(...energies);
        const min = Math.min(...energies);
        
        if (max - min <= 1) {
             issues.push({ 
                id: `flat-${index}`,
                trackId: track.id,
                severity: 'info', 
                message: '能量缺乏起伏', 
                type: 'flow' 
            });
        }
    }

    // 7. GENRE FATIGUE
    let genreCount = 0;
    for (let i = index; i >= 0; i--) {
        if (allTracks[i].genre === track.genre) {
            genreCount++;
        } else {
            break;
        }
    }
    if (genreCount >= 5) {
        issues.push({
            id: `genre-${index}`,
            trackId: track.id,
            severity: 'warning',
            message: `风格重复 (${genreCount}首)`,
            type: 'genre'
        });
    }

    // 8. SET TYPE STRATEGY
    if (setType === 'warmup') {
        if (track.energy >= 9) {
            issues.push({ 
                id: `strategy-warmup-${index}`,
                trackId: track.id,
                severity: 'warning', 
                message: '暖场能量过高', 
                type: 'meta' 
            });
        }
    } else if (setType === 'prime') {
        // Fatigue: 3 High Resonance tracks in a row
        if (index >= 2) {
            const prev1 = allTracks[index - 1];
            const prev2 = allTracks[index - 2];
            if (track.resonance >= 9 && prev1.resonance >= 9 && prev2.resonance >= 9) {
                issues.push({ 
                    id: `strategy-prime-${index}`,
                    trackId: track.id,
                    severity: 'info', 
                    message: '听觉疲劳预警 (连续金曲)', 
                    type: 'meta' 
                });
            }
        }
    }

    return issues;
};

// Global Analysis Function
export const analyzeSet = (tracks: Track[], setType: SetType, strictness: StrictnessLevel = 'standard'): SetIssue[] => {
    let allIssues: SetIssue[] = [];
    tracks.forEach((track, index) => {
        const trackIssues = analyzeTrackIssues(track, index, tracks, setType, strictness);
        allIssues = [...allIssues, ...trackIssues];
    });
    return allIssues;
};