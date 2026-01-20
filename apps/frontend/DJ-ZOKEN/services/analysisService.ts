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

const MAJOR_KEY_TO_CAMELOT: Record<string, string> = {
    C: '8B',
    'C#': '3B',
    DB: '3B',
    D: '10B',
    'D#': '5B',
    EB: '5B',
    E: '12B',
    F: '7B',
    'F#': '2B',
    GB: '2B',
    G: '9B',
    'G#': '4B',
    AB: '4B',
    A: '11B',
    'A#': '6B',
    BB: '6B',
    B: '1B'
};

const MINOR_KEY_TO_CAMELOT: Record<string, string> = {
    A: '8A',
    'A#': '3A',
    BB: '3A',
    B: '10A',
    C: '5A',
    'C#': '12A',
    DB: '12A',
    D: '7A',
    'D#': '2A',
    EB: '2A',
    E: '9A',
    F: '4A',
    'F#': '11A',
    GB: '11A',
    G: '6A',
    'G#': '1A',
    AB: '1A'
};

export const toCamelotKey = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const camelotMatch = trimmed.match(/(\d{1,2})([AB])/i);
    if (camelotMatch) {
        return `${parseInt(camelotMatch[1], 10)}${camelotMatch[2].toUpperCase()}`;
    }

    let compact = trimmed.toLowerCase().replace(/[\s_-]+/g, '');
    compact = compact.replace(/sharp/g, '#').replace(/flat/g, 'b');

    const isMinor = compact.includes('minor') || compact.endsWith('min') || (compact.endsWith('m') && !compact.endsWith('maj') && !compact.endsWith('major'));
    const isMajor = compact.includes('major') || compact.endsWith('maj');
    const mode = isMinor && !isMajor ? 'minor' : 'major';

    const noteMatch = compact.match(/^([a-g])([#b]?)/);
    if (!noteMatch) return null;
    const note = `${noteMatch[1]}${noteMatch[2] || ''}`.toUpperCase();

    const map = mode === 'minor' ? MINOR_KEY_TO_CAMELOT : MAJOR_KEY_TO_CAMELOT;
    return map[note] || null;
};

// 辅助函数: 解析 Camelot 调性 (例如 "11B", "2A")
export const parseKey = (key: string | null | undefined) => {
    if (!key) return null;
    const match = key.match(/^(\d+)([AB])$/);
    if (!match) return null;
    return { num: parseInt(match[1], 10), letter: match[2] };
};

// 核心逻辑: 计算调性兼容状态
// 基于 Camelot Wheel 混音理论
export const calculateHarmonicStatus = (keyA: string | null | undefined, keyB: string | null | undefined, strictness: StrictnessLevel): 'exact' | 'compatible' | 'clash' => {
    if (!keyA || !keyB) return 'clash';
    const normalizedA = toCamelotKey(keyA) || keyA;
    const normalizedB = toCamelotKey(keyB) || keyB;
    if (normalizedA === normalizedB) return 'exact'; // 完全相同
    
    const k1 = parseKey(normalizedA);
    const k2 = parseKey(normalizedB);
    
    if (!k1 || !k2) return 'clash'; 

    // 计算数字距离 (考虑 12-1 的循环连接)
    const numDiff = Math.abs(k1.num - k2.num);
    const circleDiff = Math.min(numDiff, 12 - numDiff);

    // 1. 同数字 (Rel. Major/Minor)
    if (circleDiff === 0) {
        if (k1.letter === k2.letter) return 'exact';
        return 'compatible'; // 8A -> 8B
    }

    // 2. 相邻数字 (Adjacent Key) - 标准混音
    if (circleDiff === 1) {
        if (strictness === 'strict') return 'clash'; // 严谨模式下可能不接受
        return 'compatible'; 
    }

    // 3. 能量提升 (+2 Key)
    if (circleDiff === 2) {
        if (strictness === 'loose') return 'compatible'; // 宽松模式下允许能量跳跃
    }

    return 'clash'; // 其他情况视为冲突
};

// 核心逻辑: 分析单曲潜在问题
export const analyzeTrackIssues = (
    track: Track, 
    index: number, 
    allTracks: Track[], 
    setType: SetType, 
    strictness: StrictnessLevel,
    cutModes?: Record<string, boolean> // 接收 Cut 模式状态
): SetIssue[] => {
    const issues: SetIssue[] = [];
    const prevTrack = index > 0 ? allTracks[index - 1] : null;
    const isCut = cutModes?.[track.id] || false; // 检查当前是否开启了“飞歌”模式

    // --- 1. 调性分析 (Harmonic Analysis) ---
    // 如果是飞歌 (Cut)，则忽略调性冲突
    const hasKeys = Boolean(prevTrack?.key && track.key);
    if (prevTrack && !isCut && hasKeys) {
        const status = calculateHarmonicStatus(prevTrack.key, track.key, strictness);
        if (status === 'clash') {
             const displayPrevKey = toCamelotKey(prevTrack.key) || prevTrack.key;
             const displayCurrentKey = toCamelotKey(track.key) || track.key;
             issues.push({
                 id: `harmonic-${index}`,
                 trackId: track.id,
                 severity: 'critical',
                 message: `调性冲突 (${displayPrevKey} -> ${displayCurrentKey})`,
                 type: 'harmonic'
             });
        }
    }

    // --- 2. BPM 分析 ---
    const hasBpms = Boolean(prevTrack && typeof prevTrack.bpm === 'number' && typeof track.bpm === 'number');
    if (prevTrack && hasBpms) {
        const bpmDiff = (track.bpm as number) - (prevTrack.bpm as number);
        // 检测倍速/半速关系 (例如 70 -> 140)
        const isDoubleTime = Math.abs((prevTrack.bpm as number) - (track.bpm as number) * 2) <= 5 || Math.abs((prevTrack.bpm as number) * 2 - (track.bpm as number)) <= 5;
        // 检测是否在标准混音范围 (+/- 6%)
        const isBpmClose = Math.abs(bpmDiff) <= 6; 

        // 如果 BPM 差距大，且不是倍速，且没有开启飞歌模式，则报错
        if (!isBpmClose && !isDoubleTime && !isCut) {
            issues.push({
                id: `bpm-${index}`,
                trackId: track.id,
                severity: 'warning',
                message: `BPM 差异过大 (${prevTrack.bpm} -> ${track.bpm})`,
                type: 'bpm'
            });
        }
    }

    // --- 3. 能量流向分析 (Energy Flow) ---
    if (prevTrack) {
        const energyDiff = track.energy - prevTrack.energy;
        // 检测能量剧烈变化
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

    // --- 4. 连续能量衰减检测 (Energy Drain) ---
    if (index >= 2) {
        const tMinus1 = allTracks[index - 1];
        const tMinus2 = allTracks[index - 2];
        // 模式: High -> Med -> Low
        if (tMinus2.energy > tMinus1.energy && tMinus1.energy > track.energy) {
            const isClosing = setType === 'closing';
            // 在 Warmup 中，我们希望缓慢爬坡，所以连续下降是警告
            issues.push({ 
                id: `drain-${index}`,
                trackId: track.id,
                severity: isClosing ? 'info' : 'warning', 
                message: '连续能量衰减', 
                type: 'flow' 
            });
        }
    }

    // --- 5. 过山车效应检测 (Rollercoaster) ---
    // 检测 V 字形或 A 字形的大幅波动
    if (index >= 2) {
        const prev1 = allTracks[index - 1];
        const prev2 = allTracks[index - 2];
        const diff1 = track.energy - prev1.energy;     // 当前过渡
        const diff2 = prev1.energy - prev2.energy;     // 上一个过渡

        // 方向相反 且 幅度都很大 (>=3)
        if ((diff1 > 0) !== (diff2 > 0) && Math.abs(diff1) >= 3 && Math.abs(diff2) >= 3) {
            issues.push({ 
                id: `rollercoaster-${index}`,
                trackId: track.id,
                severity: 'warning',
                message: '能量波动过大 (过山车)', 
                type: 'flow' 
            });
        }
    }

    // --- 6. 能量平淡检测 (Flatness) ---
    // 连续 4 首歌能量变化极小 (Warmup 除外)
    if (index >= 3 && setType !== 'warmup') {
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

    // --- 7. 审美疲劳检测 (Genre Fatigue) ---
    // 连续 5 首同一流派
    let genreCount = 0;
    if (track.genre) {
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
    }

    // --- 8. Set 策略检测 (Meta Strategy) ---
    if (setType === 'warmup') {
        // 暖场不应播放过于高能的歌
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
        // 黄金时段: 连续金曲轰炸预警
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

// 全局分析入口
export const analyzeSet = (tracks: Track[], setType: SetType, strictness: StrictnessLevel = 'standard', cutModes?: Record<string, boolean>): SetIssue[] => {
    let allIssues: SetIssue[] = [];
    tracks.forEach((track, index) => {
        const trackIssues = analyzeTrackIssues(track, index, tracks, setType, strictness, cutModes);
        allIssues = [...allIssues, ...trackIssues];
    });
    return allIssues;
};
