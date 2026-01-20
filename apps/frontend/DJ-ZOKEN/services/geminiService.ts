import { GoogleGenAI, Type } from "@google/genai";
import { Track, TransitionAnalysis, AISuggestion, SetType, BridgeRecommendation } from "../types";

// 辅助函数: 解析调性
const parseKey = (key: string | null | undefined) => {
    if (!key) return null;
    const match = key.match(/^(\d+)([AB])$/);
    if (!match) return null;
    return { num: parseInt(match[1], 10), letter: match[2] };
};

// 辅助函数: 风格归类 (用于计算兼容性)
const getGenreGroup = (genre: string | null | undefined): string => {
    const g = (genre || '').toLowerCase();
    if (g.includes('house') || g.includes('disco') || g.includes('dance')) return 'house_disco';
    if (g.includes('techno') || g.includes('trance') || g.includes('progressive')) return 'techno_trance';
    if (g.includes('hip hop') || g.includes('rap') || g.includes('trap') || g.includes('r&b') || g.includes('funk')) return 'urban';
    if (g.includes('dnb') || g.includes('bass') || g.includes('dubstep')) return 'bass';
    if (g.includes('pop') || g.includes('k-pop')) return 'pop';
    if (g.includes('rock') || g.includes('alternative') || g.includes('indie')) return 'rock';
    if (g.includes('latin') || g.includes('reggaeton')) return 'latin';
    return 'other';
};

// 辅助函数: 标准化歌名 (去除括号里的 Remix 信息等)
const normalizeTrackName = (title: string) => {
    return title.replace(/\s*[\[\(].*?[\]\)]/g, '').toLowerCase().trim();
};

const normalizeArtistName = (artist: string) => {
    return artist.toLowerCase().trim();
};

const getApiKey = () => {
    if (typeof window !== 'undefined') {
        try {
            const stored = window.localStorage.getItem('gemini_api_key');
            if (stored && stored.trim()) return stored.trim();
        } catch {
            // Ignore localStorage access issues
        }
    }
    return process.env.API_KEY || process.env.GEMINI_API_KEY;
};

/**
 * 本地智能推荐算法 - 进阶版 V4
 * 
 * 核心逻辑:
 * 1. 上下文分析: 分析 Set 中最后几首歌的趋势 (能量、风格、疲劳度)。
 * 2. 候选池过滤: 严格去重 (包括 Remix 版本识别)。
 * 3. 评分系统: 基于 BPM、调性、能量、风格兼容性进行打分。
 * 4. 策略修正: 根据 Set 类型 (Warmup/Prime/Closing) 和共鸣度进行加权。
 */
export const getAiSuggestions = async (currentSet: Track[], availableLibrary: Track[], setType: SetType): Promise<AISuggestion[]> => {
  // 模拟计算延迟，增加真实感
  await new Promise(resolve => setTimeout(resolve, 600));

  if (currentSet.length === 0) return [];

  // --- 1. 上下文分析 (Context Analysis) ---
  const lastTrack = currentSet[currentSet.length - 1];
  const lastKey = parseKey(lastTrack.key);
  
  // 获取最近 3 首歌来分析趋势
  const recentTracks = currentSet.slice(-3);
  
  // 计算能量趋势 (上升/下降)
  let energyTrend = 0;
  if (recentTracks.length >= 2) {
      const e1 = recentTracks[recentTracks.length - 2].energy;
      const e2 = recentTracks[recentTracks.length - 1].energy;
      energyTrend = e2 - e1;
  }
  
  // 风格惯性: 检查最近是否一直播放同一种风格
  const recentGenreGroup = getGenreGroup(lastTrack.genre);
  const isGenreLocked = recentTracks.every(t => getGenreGroup(t.genre) === recentGenreGroup);

  // 疲劳分析 1: 听觉疲劳 (连续极高共鸣)
  const isHighResonanceFatigue = recentTracks.length >= 2 && recentTracks.every(t => t.resonance >= 9);

  // 疲劳分析 2: 身体疲劳 (连续高能量 + 高共鸣) -> 触发"降能大合唱"策略
  // 条件: 最近 3 首歌 能量 >= 7 且 共鸣 >= 8
  const isPhysicalFatigue = recentTracks.length >= 3 && recentTracks.every(t => t.energy >= 7 && t.resonance >= 8);


  // --- 2. 候选池过滤 (Strict Deduplication) ---
  const candidates = availableLibrary.filter(libTrack => {
      // 2.1. ID 精确查重
      const isExactDuplicate = currentSet.some(setTrack => setTrack.id.split('-')[0] === libTrack.id);
      if (isExactDuplicate) return false;

      // 2.2. Remix / 版本查重
      // 防止推荐同一首歌的不同 Remix 版本
      const libTitle = normalizeTrackName(libTrack.title);
      const isRemixDuplicate = currentSet.some(setTrack => {
          const setTitle = normalizeTrackName(setTrack.title);
          
          if (libTitle !== setTitle) return false;

          // 标题相同，进一步检查艺术家是否有重叠
          const libArtist = normalizeArtistName(libTrack.artist);
          const setArtist = normalizeArtistName(setTrack.artist);
          
          return libArtist.includes(setArtist) || setArtist.includes(libArtist);
      });

      return !isRemixDuplicate;
  });

  // --- 3. 评分逻辑 (Scoring) ---
  const scoredCandidates = candidates.map(track => {
      let score = 0;
      let reasons: string[] = [];
      const trackGenreGroup = getGenreGroup(track.genre);

      // A. BPM 分析 (基准分 30)
      const hasBpm = typeof track.bpm === 'number' && typeof lastTrack.bpm === 'number';
      if (hasBpm) {
          const bpmDiff = Math.abs(track.bpm - lastTrack.bpm);
          const isDouble = Math.abs(track.bpm - lastTrack.bpm * 2) <= 5;
          const isHalf = Math.abs(track.bpm * 2 - lastTrack.bpm) <= 5;

          if (bpmDiff <= 2) {
              score += 30;
              reasons.push("速度完美契合");
          } else if (bpmDiff <= 6) {
              score += 20;
          } else if (isDouble || isHalf) {
              score += 25;
              reasons.push("倍速/半速能量转换");
          } else if (bpmDiff > 15 && bpmDiff < 30) {
               score -= 10; // 扣分: 速度差异较大
          } else if (bpmDiff >= 30) {
               score -= 30; // 扣分: 速度完全不搭
          }
      }

      // B. 调性分析 (基准分 35)
      const currentKey = parseKey(track.key);
      let harmonicMatch = false;

      if (lastKey && currentKey) {
          const numDiff = Math.abs(lastKey.num - currentKey.num);
          const circleDiff = Math.min(numDiff, 12 - numDiff);

          if (circleDiff === 0) {
              if (lastKey.letter === currentKey.letter) {
                  score += 35; 
                  reasons.push("同调性无缝混音");
                  harmonicMatch = true;
              } else {
                  score += 25; 
                  reasons.push("大小调情感切换");
                  harmonicMatch = true;
              }
          } else if (circleDiff === 1) {
              if (lastKey.letter === currentKey.letter) {
                  score += 30;
                  reasons.push("相邻调和谐过渡");
                  harmonicMatch = true;
              } else {
                  score += 15; 
              }
          } else if (circleDiff === 2 && lastKey.letter === currentKey.letter) {
               // Energy Boost (+2)
               let isBoost = false;
               const targetBoost = (lastKey.num + 2) > 12 ? (lastKey.num + 2) - 12 : lastKey.num + 2;
               if (currentKey.num === targetBoost) isBoost = true;

               if (isBoost) {
                   score += 20;
                   reasons.push("调性能量提升 (+2 Key)");
               }
          } else {
              score -= 10; // 调性不搭
          }
      }

      // C. 能量流向与趋势 (基准分 20)
      const energyDiff = track.energy - lastTrack.energy;
      
      // 防止能量衰减 (Consecutive Drop)
      let isEnergyDrainRisk = false;
      if (recentTracks.length >= 2) {
          const tMinus1 = recentTracks[recentTracks.length - 1];
          const tMinus2 = recentTracks[recentTracks.length - 2];
          // 如果前几首已经在掉能量
          if (tMinus2.energy > tMinus1.energy) {
               // 并且这一首继续掉
               if (track.energy < tMinus1.energy) {
                   isEnergyDrainRisk = true;
               }
          }
      }

      if (energyTrend > 0) { // 正在 Build-up (爬坡)
          if (energyDiff >= 0 && energyDiff <= 2) {
              score += 20;
              reasons.push("延续能量堆叠");
          } else if (energyDiff < 0) {
               // 如果没有触发身体疲劳策略，爬坡时突然掉能量要扣分
               if (!isPhysicalFatigue) {
                   score -= 5; 
               }
          }
      } else {
          if (Math.abs(energyDiff) <= 1) {
              score += 15;
              reasons.push("维持当前氛围");
          } else if (energyDiff === 2) {
              score += 15;
              reasons.push("注入新能量");
          }
      }

      // D. 风格兼容性 (基准分 15)
      const hasGenres = Boolean(track.genre && lastTrack.genre);
      if (hasGenres && track.genre === lastTrack.genre) {
          score += 15;
          if (isGenreLocked && recentTracks.length >= 2) {
              score += 5;
              reasons.push(`保持 ${track.genre} 律动`);
          } else {
              reasons.push("同风格");
          }
      } else if (trackGenreGroup === recentGenreGroup && trackGenreGroup !== 'other') {
          score += 10;
          reasons.push("风格兼容");
      } else {
          if (!harmonicMatch) score -= 10; 
          else reasons.push("跨风格混搭");
      }

      // E. 艺术家去重 (防止连放同一个人的歌)
      if (track.artist === lastTrack.artist) {
          score -= 15; 
      }

      // ==========================================
      // F. 共鸣度与策略深度逻辑 (Resonance & Strategy)
      // ==========================================

      // *** 策略优先: 身体疲劳缓解 (Rest but Sing) ***
      // 连续高能轰炸后，推荐低能高共鸣歌曲 (降能大合唱)
      let isRestStrategyTriggered = false;
      if (isPhysicalFatigue && setType !== 'warmup') {
          // 目标: 能量低 (<=6) 但 共鸣高 (>=8)
          if (track.energy <= 6 && track.resonance >= 8) {
              score += 40; // 极高权重提升
              reasons.push("🧘 降能大合唱 (身体休息)");
              isRestStrategyTriggered = true;
          }
      }
      
      // 如果没有特殊策略，且存在能量衰减风险，则扣分
      if (isEnergyDrainRisk && !isRestStrategyTriggered && setType !== 'closing') {
          score -= 20;
          reasons.push("避免连续能量衰减");
      }

      // 1. Warm-up (暖场) 策略
      if (setType === 'warmup') {
          if (track.resonance >= 9) {
              score -= 20; 
              reasons.push("保留金曲至主时段");
          } else if (track.resonance >= 4 && track.resonance <= 7) {
              score += 15;
              reasons.push("适合暖场铺垫");
          }
      } 
      // 2. Prime (黄金时段) 策略
      else if (setType === 'prime') {
          if (track.resonance >= 8) {
              score += 15;
              if (lastTrack.resonance <= 5) {
                   score += 20; 
                   reasons.push("🔥 冷场救星 (Hit Song)");
              } else {
                   if (!isRestStrategyTriggered) reasons.push("维持舞池热度");
              }
          }
          // 听觉疲劳缓解: 连续大热单后，稍微降一点共鸣度
          if (isHighResonanceFatigue && !isRestStrategyTriggered && track.resonance >= 6 && track.resonance <= 8) {
              score += 15;
              reasons.push("听觉缓冲 Groove");
          }
      }
      // 3. Closing (收尾) 策略
      else if (setType === 'closing') {
          if (track.resonance >= 9) {
              score += 25;
              reasons.push("全场大合唱时刻");
          } else if (track.energy <= 5 && track.resonance >= 7) {
              score += 20;
              reasons.push("感性收尾");
          }
      }

      // 4. 通用共鸣流向
      // 低 -> 高: 唤醒
      if (lastTrack.resonance < 5 && track.resonance > 7 && setType !== 'warmup') {
          if (!reasons.some(r => r.includes("救星"))) reasons.push("拉升人气");
      }
      // 高 -> 低: 掉人风险 (除非是 Cool down)
      if (lastTrack.resonance > 8 && track.resonance < 5 && !isRestStrategyTriggered) {
          score -= 10; 
      }

      // 整理理由: 优先展示带 Emoji 的特殊策略
      const uniqueReasons = Array.from(new Set(reasons));
      const priorityReasons = uniqueReasons.filter(r => r.includes("🧘") || r.includes("🔥") || r.includes("调性") || r.includes("暖场") || r.includes("合唱"));
      const otherReasons = uniqueReasons.filter(r => !priorityReasons.includes(r));
      const finalReasons = [...priorityReasons, ...otherReasons];

      const displayReason = finalReasons.slice(0, 2).join(" + ") || "风格探索";

      return {
          trackId: track.id,
          score: Math.max(0, Math.min(100, score)),
          reasoning: displayReason
      };
  });

  // 返回分数最高的 5 首
  return scoredCandidates
      .filter(s => s.score >= 45) 
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
};

// 调用 Gemini 分析两首歌的过渡方式 (Mix vs Cut)
export const analyzeTransitionAi = async (trackA: Track, trackB: Track): Promise<TransitionAnalysis | null> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("No API KEY found");
    return null;
  }

  const ai = new GoogleGenAI({ apiKey });

  const bpmA = typeof trackA.bpm === 'number' ? trackA.bpm : '—';
  const bpmB = typeof trackB.bpm === 'number' ? trackB.bpm : '—';
  const keyA = trackA.key || '—';
  const keyB = trackB.key || '—';
  const genreA = trackA.genre || '—';
  const genreB = trackB.genre || '—';

  const prompt = `
    分析过渡:
    A: ${trackA.title} (BPM:${bpmA}, Key:${keyA}, Genre:${genreA})
    B: ${trackB.title} (BPM:${bpmB}, Key:${keyB}, Genre:${genreB})

    建议 Mix (混音) 还是 Cut (切歌/丢歌)? 
    HipHop/Bass 或 BPM 差距大建议 Cut。House/Techno 或 BPM 接近建议 Mix。
    请确保 'reasoning' 字段使用中文回答。
  `;

  try {
    const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                systemInstruction: "你是一个精通各类混音技巧的 DJ 导师。请始终用中文进行分析与建议，reasoning 必须是中文。",
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        type: { type: Type.STRING, enum: ["mix", "cut"] },
                        reasoning: { type: Type.STRING }
                    }
                }
            }
        });

    const text = response.text?.trim();
    if (!text) return null;
    return JSON.parse(text) as TransitionAnalysis;
  } catch (error) {
    console.error("AI Transition Analysis Error:", error);
    return null;
  }
};

/**
 * 智能过桥 (Smart Bridge):
 * 当两首歌 BPM 或调性冲突时，寻找中间歌曲或提供混音技巧。
 */
export const getSmartBridgeRecommendation = async (trackA: Track, trackB: Track, library: Track[]): Promise<BridgeRecommendation | null> => {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    if (typeof trackA.bpm !== 'number' || typeof trackB.bpm !== 'number') return null;

    // 1. 本地初筛: 寻找 BPM 在 A 和 B 之间，且调性兼容 A 的歌曲
    const minBpm = Math.min(trackA.bpm, trackB.bpm);
    const maxBpm = Math.max(trackA.bpm, trackB.bpm);
    
    // 放宽筛选范围
    const candidates = library.filter(t => {
        // 排除自己
        if (t.id === trackA.id || t.id === trackB.id) return false;
        
        // BPM 检查
        if (typeof t.bpm !== 'number') return false;
        const inBpmRange = t.bpm >= (minBpm - 5) && t.bpm <= (maxBpm + 5);
        
        // 调性检查 (简化逻辑，只看同调或相邻调，具体交给 AI 判断)
        return inBpmRange;
    }).slice(0, 15); // 只取前 15 个最接近的

    // 构建上下文发给 AI
    const candidateContext = candidates.map(c => 
        `ID:${c.id} | ${c.title} by ${c.artist} | BPM:${typeof c.bpm === 'number' ? c.bpm : '—'} | Key:${c.key || '—'} | Genre:${c.genre || '—'}`
    ).join('\n');

    const keyA = trackA.key || '—';
    const keyB = trackB.key || '—';
    const genreA = trackA.genre || '—';
    const genreB = trackB.genre || '—';

    const prompt = `
    我遇到了一个混音难题。
    当前歌曲 A: ${trackA.title} (BPM:${trackA.bpm}, Key:${keyA}, Genre:${genreA})
    下一首歌曲 B: ${trackB.title} (BPM:${trackB.bpm}, Key:${keyB}, Genre:${genreB})

    存在 BPM 差异过大或调性冲突。

    请从以下候选曲库中推荐一首“过桥歌曲”(Bridge Track)，插入到 A 和 B 之间。
    要求:
    1. BPM 最好在 A 和 B 之间，起到过渡作用。
    2. 调性最好兼容 A (以便混入) 和 B (以便混出)，或者至少平滑过渡。
    
    候选曲库:
    ${candidateContext}

    如果没有合适的过桥歌曲，请直接给出一个具体的 DJ 混音技巧 (Technique) 来解决这个冲突 (例如: Echo Out, Backspin, Hard Cut on Drop, Loop Out 等)。
    Technique 的名称和 reasoning 都必须是中文。

    返回 JSON 格式。
    如果推荐歌曲: type="track", trackId="ID", reasoning="为什么选这首"
    如果推荐技巧: type="technique", suggestionTitle="技巧名称(中文)", reasoning="如何操作(中文)"
    `;

    const ai = new GoogleGenAI({ apiKey });
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                systemInstruction: "你是一个专业的 DJ。必须全程中文输出；当遇到两首歌不搭时，推荐一首中间曲目过渡，或给出一个中文命名的混音技巧与中文理由。",
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        type: { type: Type.STRING, enum: ["track", "technique"] },
                        trackId: { type: Type.STRING, description: "Only if type is track" },
                        suggestionTitle: { type: Type.STRING, description: "Track Title or Technique Name" },
                        reasoning: { type: Type.STRING }
                    },
                    required: ["type", "reasoning", "suggestionTitle"]
                }
            }
        });

        const text = response.text?.trim();
        if (!text) return null;
        return JSON.parse(text) as BridgeRecommendation;

    } catch (e) {
        console.error("Smart Bridge AI Error", e);
        return null;
    }
};
