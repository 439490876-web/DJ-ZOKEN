import { GoogleGenAI, Type } from "@google/genai";
import { Track, TransitionAnalysis, AISuggestion, SetType } from "../types";

// Helper to parse Camelot keys (e.g. "11B", "2A")
const parseKey = (key: string) => {
    const match = key.match(/^(\d+)([AB])$/);
    if (!match) return null;
    return { num: parseInt(match[1], 10), letter: match[2] };
};

// Helper: Genre Grouping for Compatibility
const getGenreGroup = (genre: string): string => {
    const g = genre.toLowerCase();
    if (g.includes('house') || g.includes('disco') || g.includes('dance')) return 'house_disco';
    if (g.includes('techno') || g.includes('trance') || g.includes('progressive')) return 'techno_trance';
    if (g.includes('hip hop') || g.includes('rap') || g.includes('trap') || g.includes('r&b') || g.includes('funk')) return 'urban';
    if (g.includes('dnb') || g.includes('bass') || g.includes('dubstep')) return 'bass';
    if (g.includes('pop') || g.includes('k-pop')) return 'pop';
    if (g.includes('rock') || g.includes('alternative') || g.includes('indie')) return 'rock';
    if (g.includes('latin') || g.includes('reggaeton')) return 'latin';
    return 'other';
};

// Helper: Normalize Track Name (Remove brackets, etc.)
const normalizeTrackName = (title: string) => {
    // Remove content in parentheses or brackets, and trim
    // e.g. "Midnight City (Eric Prydz Remix)" -> "midnight city"
    return title.replace(/\s*[\[\(].*?[\]\)]/g, '').toLowerCase().trim();
};

const normalizeArtistName = (artist: string) => {
    return artist.toLowerCase().trim();
};

/**
 * 本地智能推荐算法 - 进阶版 V4
 * 结合 BPM、调性、能量流向、风格家族 以及 Set阶段策略/共鸣度深度分析
 * 包含: "降能大合唱" 策略 (Physical Rest, Emotional Sustain)
 * 新增: 防止连续能量衰减 (Energy Drain Protection)
 * 新增: 严格的去重逻辑 (防止同一首歌的 Remix 版本重复推荐)
 */
export const getAiSuggestions = async (currentSet: Track[], availableLibrary: Track[], setType: SetType): Promise<AISuggestion[]> => {
  // 模拟计算延迟
  await new Promise(resolve => setTimeout(resolve, 600));

  if (currentSet.length === 0) return [];

  // --- 1. 上下文分析 (Context Analysis) ---
  const lastTrack = currentSet[currentSet.length - 1];
  const lastKey = parseKey(lastTrack.key);
  
  // 获取最近 3 首歌来分析趋势
  const recentTracks = currentSet.slice(-3);
  
  // 计算能量趋势
  let energyTrend = 0;
  if (recentTracks.length >= 2) {
      const e1 = recentTracks[recentTracks.length - 2].energy;
      const e2 = recentTracks[recentTracks.length - 1].energy;
      energyTrend = e2 - e1;
  }
  
  // 风格惯性
  const recentGenreGroup = getGenreGroup(lastTrack.genre);
  const isGenreLocked = recentTracks.every(t => getGenreGroup(t.genre) === recentGenreGroup);

  // 疲劳分析 1: 听觉疲劳 (连续极高共鸣)
  const isHighResonanceFatigue = recentTracks.length >= 2 && recentTracks.every(t => t.resonance >= 9);

  // 疲劳分析 2: 身体疲劳 (连续高能量 + 高共鸣) -> 触发"降能大合唱"策略
  // 条件: 最近 3 首歌 能量 >= 7 且 共鸣 >= 8
  const isPhysicalFatigue = recentTracks.length >= 3 && recentTracks.every(t => t.energy >= 7 && t.resonance >= 8);


  // --- 2. 候选池过滤 (Strict Deduplication) ---
  const candidates = availableLibrary.filter(libTrack => {
      // 2.1. Exact ID Check
      const isExactDuplicate = currentSet.some(setTrack => setTrack.id.split('-')[0] === libTrack.id);
      if (isExactDuplicate) return false;

      // 2.2. Remix / Version Check
      // Check if any track in the current set is essentially the same song (different version)
      const libTitle = normalizeTrackName(libTrack.title);
      const isRemixDuplicate = currentSet.some(setTrack => {
          const setTitle = normalizeTrackName(setTrack.title);
          
          // If simplified titles don't match, they are different songs
          if (libTitle !== setTitle) return false;

          // If titles match, verify artists to distinguish different songs with same name
          // e.g. "Hello" (Adele) vs "Hello" (Lionel Richie)
          // Heuristic: If artist names share significant overlap (substring match)
          const libArtist = normalizeArtistName(libTrack.artist);
          const setArtist = normalizeArtistName(setTrack.artist);
          
          // E.g. "M83" vs "M83" -> true
          // "David Guetta" vs "David Guetta & Sia" -> true
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
           score -= 10;
      } else if (bpmDiff >= 30) {
           score -= 30;
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
              score -= 10; 
          }
      }

      // C. 能量流向与趋势 (基准分 20)
      const energyDiff = track.energy - lastTrack.energy;
      
      // Energy Drain Prevention (Consecutive Drop)
      let isEnergyDrainRisk = false;
      if (recentTracks.length >= 2) {
          const tMinus1 = recentTracks[recentTracks.length - 1];
          const tMinus2 = recentTracks[recentTracks.length - 2];
          // If previous tracks showed a drop pattern (Prev2 > Prev1)
          if (tMinus2.energy > tMinus1.energy) {
               // And this candidate continues the drop
               if (track.energy < tMinus1.energy) {
                   isEnergyDrainRisk = true;
               }
          }
      }

      if (energyTrend > 0) { // 正在 Build-up
          if (energyDiff >= 0 && energyDiff <= 2) {
              score += 20;
              reasons.push("延续能量堆叠");
          } else if (energyDiff < 0) {
               // 如果触发了身体疲劳策略，这里不扣分，反而在后面加分
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
      if (track.genre === lastTrack.genre) {
          score += 15;
          if (isGenreLocked && recentTracks.length >= 2) {
              score += 5;
              reasons.push(`保持 ${track.genre} 律动`);
          } else {
              reasons.push("同风格");
          }
      } else if (trackGenreGroup === recentGenreGroup) {
          score += 10;
          reasons.push("风格兼容");
      } else {
          if (!harmonicMatch) score -= 10; 
          else reasons.push("跨风格混搭");
      }

      // E. 艺术家去重
      if (track.artist === lastTrack.artist) {
          score -= 15; 
      }

      // ==========================================
      // F. 共鸣度与策略深度逻辑 (Resonance Logic)
      // ==========================================

      // *** 策略优先检查: 身体疲劳缓解 (Rest but Sing) ***
      // 连续高能轰炸后，推荐低能高共鸣歌曲 (Pop/R&B/Sing-along)
      let isRestStrategyTriggered = false;
      if (isPhysicalFatigue && setType !== 'warmup') {
          // 目标: 能量低 (<=6) 但 共鸣高 (>=8)
          if (track.energy <= 6 && track.resonance >= 8) {
              score += 40; // 极高权重提升
              reasons.push("🧘 降能大合唱 (身体休息)");
              isRestStrategyTriggered = true;
          }
      }
      
      // Apply Penalty for Energy Drain (unless specific rest strategy is active or closing)
      if (isEnergyDrainRisk && !isRestStrategyTriggered && setType !== 'closing') {
          score -= 20;
          reasons.push("避免连续能量衰减");
      }

      // 1. Warm-up 策略
      if (setType === 'warmup') {
          if (track.resonance >= 9) {
              score -= 20; 
              reasons.push("保留金曲至主时段");
          } else if (track.resonance >= 4 && track.resonance <= 7) {
              score += 15;
              reasons.push("适合暖场铺垫");
          }
      } 
      // 2. Prime 策略
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
          // 听觉疲劳缓解: 连续大热单后，稍微降一点共鸣度 (如果没有触发降能策略)
          if (isHighResonanceFatigue && !isRestStrategyTriggered && track.resonance >= 6 && track.resonance <= 8) {
              score += 15;
              reasons.push("听觉缓冲 Groove");
          }
      }
      // 3. Closing 策略
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

      // 整理理由
      const uniqueReasons = Array.from(new Set(reasons));
      // 优先展示带 Emoji 或 关键信息的理由
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

  return scoredCandidates
      .filter(s => s.score >= 45) 
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
};

export const analyzeTransitionAi = async (trackA: Track, trackB: Track): Promise<TransitionAnalysis | null> => {
  if (!process.env.API_KEY) {
    console.warn("No API KEY found");
    return null;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    分析过渡:
    A: ${trackA.title} (BPM:${trackA.bpm}, Key:${trackA.key}, Genre:${trackA.genre})
    B: ${trackB.title} (BPM:${trackB.bpm}, Key:${trackB.key}, Genre:${trackB.genre})

    建议 Mix (混音) 还是 Cut (切歌/丢歌)? 
    HipHop/Bass 或 BPM 差距大建议 Cut。House/Techno 或 BPM 接近建议 Mix。
    请确保 'reasoning' 字段使用中文回答。
  `;

  try {
    const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                systemInstruction: "你是一个精通各类混音技巧的 DJ 导师。请始终使用中文进行分析和建议。",
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