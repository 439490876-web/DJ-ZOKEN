import { Track, SetType } from '../types';
import { getGenreCategory } from './trackService';

export interface CueStrategy {
    estimatedSeconds: number;
    formattedDuration: string;
    label: string; // 例如 "Quick Mix", "Full Play"
    description: string;
    type: 'quick' | 'extended' | 'standard' | 'full';
}

// 辅助: MM:SS 转秒
export const parseDurationToSeconds = (durationStr: string): number => {
    if (!durationStr) return 0;
    const parts = durationStr.split(':');
    if (parts.length !== 2) return 0;
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
};

// 辅助: 秒转 MM:SS
export const formatSecondsToDuration = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * 计算单曲的“有效播放时长”策略
 * 不同的流派和时段，DJ 播放一首歌的时长是不同的。
 * 例如：HipHop 经常只放 2 分钟，而 Progressive House 可能放 5-6 分钟。
 */
export const calculateCueStrategy = (track: Track, setType: SetType): CueStrategy => {
    const totalSeconds = parseDurationToSeconds(track.duration);
    const genreCat = getGenreCategory(track.genre);
    
    // 默认: 标准混音 (播放 75% 的长度)
    let estimated = totalSeconds * 0.75;
    let label = "标准混音";
    let type: CueStrategy['type'] = 'standard';
    let description = "Intro/Outro 叠歌";

    // 1. 基于流派的基准线 (Genre Baseline)
    // Hip-Hop, Pop, DnB 通常采用快节奏接歌 (Verse-Chorus-Verse-Chorus)
    if (['Hip Hop / R&B', 'Pop / Dance', 'Bass / DnB', 'Latin'].includes(genreCat)) {
        estimated = Math.min(totalSeconds, 150); // 限制在 2分30秒以内
        label = "短接";
        type = 'quick';
        description = "V1-C1-V2-C2 切歌";
    }

    // 2. 基于 Set 类型的修正 (Set Phase & Resonance)

    // --- WARM UP (暖场) ---
    if (setType === 'warmup') {
        // 暖场时，House/Techno 应该让它充分铺垫 (Let tracks breathe)
        if (['House / Disco', 'Techno', 'Trance', 'Chill / Jazz'].includes(genreCat)) {
            estimated = Math.max(totalSeconds * 0.85, 210); // 至少 3分30秒
            estimated = Math.min(estimated, totalSeconds); 
            label = "长混音";
            type = 'extended';
            description = "铺垫氛围，长Blend";
        } else {
            // 即便是 Pop 歌，暖场时也放长一点
            estimated = totalSeconds * 0.8; 
            label = "舒缓接歌";
            type = 'standard';
        }
    }

    // --- PRIME TIME (黄金时段) ---
    else if (setType === 'prime') {
        // 场景 A: 高共鸣金曲 (Anthem) -> 必须放久一点让大家合唱
        if (track.resonance >= 8) {
            estimated = Math.min(totalSeconds * 0.9, 240); // 最多 4分钟，通常播完第二段 Drop
            label = "金曲延展";
            type = 'extended';
            description = "高共鸣：播放至第二段高潮";
            
            // 特例: 如果歌本身就很短 (Punk/Pop < 3min)，则完整播放
            if (totalSeconds < 180) {
                 estimated = totalSeconds;
                 label = "完整播放";
                 type = 'full';
            }
        } 
        // 场景 B: 低共鸣/功能性歌曲 (Tool) -> 快速过，保持能量
        else if (track.resonance < 7) {
            estimated = Math.min(estimated, 135); // 最多 2分15秒
            label = "快速过歌";
            type = 'quick';
            description = "功能性铺垫，一高潮即走";
        }
    }

    // --- CLOSING (收尾) ---
    else if (setType === 'closing') {
        estimated = totalSeconds * 0.95; // 几乎播完
        label = "完整呈现";
        type = 'full';
        description = "情感沉淀，保留尾奏";
    }

    // 最终边界检查
    if (estimated > totalSeconds) estimated = totalSeconds;
    if (estimated < 60) estimated = 60; // 至少播 1 分钟 (除非是 Loop/Tool)

    return {
        estimatedSeconds: Math.floor(estimated),
        formattedDuration: formatSecondsToDuration(estimated),
        label,
        description,
        type
    };
};

// 计算整个 Set 的预计总时长
export const calculateTotalSetDuration = (tracks: Track[], setType: SetType): string => {
    const totalSeconds = tracks.reduce((acc, track) => {
        return acc + calculateCueStrategy(track, setType).estimatedSeconds;
    }, 0);
    return formatSecondsToDuration(totalSeconds);
};