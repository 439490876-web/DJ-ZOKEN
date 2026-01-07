import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Track, TransitionAnalysis } from "../types";

const SYSTEM_INSTRUCTION = `你是一位专业的 DJ 和音乐理论专家助手。
你的目标是帮助用户编排流畅的 DJ Set。
你精通“Camelot Wheel”调性混合理论、能量流控制（铺垫 build-up 或释放 drop），以及 BPM 转换技巧。
在推荐歌曲时，优先考虑调性兼容性和合理的 BPM 跨度（除非用户需要剧烈的能量转换）。
请始终使用中文回复。
`;

// Helper: Timeout Promise (Increased to 30 seconds for safety)
const withTimeout = <T>(promise: Promise<T>, ms: number = 30000): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => 
            setTimeout(() => reject(new Error(`请求超时 (${ms/1000}秒)，AI 响应较慢，请减少上下文或重试。`)), ms)
        )
    ]);
};

export const getAiSuggestions = async (currentSet: Track[], availableLibrary: Track[]): Promise<string> => {
  if (!process.env.API_KEY) {
    console.warn("No API KEY found");
    return JSON.stringify({ error: "API Key missing" });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const lastTrack = currentSet[currentSet.length - 1];
  
  // Context: Provide last 3 tracks to understand the flow/direction
  const recentTracks = currentSet.slice(-3).map(t => `${t.title} (${t.key}, ${t.bpm} BPM, Energy ${t.energy})`).join(' -> ');

  // --- SMART PRE-FILTERING ---
  // 1. Duplicate Check
  // 2. BPM Check (Broad compatibility)
  const candidateTracks = availableLibrary.filter(libTrack => {
      const isAlreadyInSet = currentSet.some(setTrack => setTrack.id.split('-')[0] === libTrack.id);
      if (isAlreadyInSet) return false;

      const r = lastTrack.bpm;
      const t = libTrack.bpm;
      
      const isTempoCompatible = 
        (t >= r * 0.7 && t <= r * 1.3) || // Normal mix range (+/- 30%)
        (t >= r * 1.8 && t <= r * 2.2) || // Double time
        (t >= r * 0.45 && t <= r * 0.55); // Half time

      return isTempoCompatible;
  });

  // Fallback: If pre-filtering removed too many, fallback to non-duplicates (ignore BPM filter)
  let finalCandidates = candidateTracks;
  if (finalCandidates.length < 5) {
      finalCandidates = availableLibrary.filter(t => !currentSet.some(s => s.id.split('-')[0] === t.id));
  }
  
  // --- SORTING & CAPPING ---
  // To ensure the best candidates are sent to AI within the limit
  const targetBpm = lastTrack.bpm;
  
  // Helper to calculate BPM distance (accounting for 1x, 2x, 0.5x)
  const getBpmDistance = (trackBpm: number, target: number) => {
        const diff1 = Math.abs(trackBpm - target);
        const diffDouble = Math.abs(trackBpm * 2 - target); // e.g. 70*2 - 140 = 0
        const diffHalf = Math.abs(trackBpm - target * 2);   // e.g. 140 - 70*2 = 0
        return Math.min(diff1, diffDouble, diffHalf);
  };

  finalCandidates.sort((a, b) => {
      return getBpmDistance(a.bpm, targetBpm) - getBpmDistance(b.bpm, targetBpm);
  });

  // CRITICAL OPTIMIZATION: 
  // 1. Cap candidates to max 20 (was 35) to strictly control latency.
  if (finalCandidates.length > 20) {
      finalCandidates = finalCandidates.slice(0, 20);
  }

  // 2. Use Compact Text Format instead of JSON for the prompt.
  // This significantly reduces token count compared to JSON.stringify(objectArray).
  const candidateListText = finalCandidates.map(t => 
    `[ID:${t.id}] ${t.title} - ${t.artist} (BPM:${t.bpm}, Key:${t.key}, Energy:${t.energy}, Genre:${t.genre})`
  ).join('\n');

  const prompt = `
    我正在编排一个 DJ Set。
    
    最近播放历史: ${recentTracks}
    
    当前歌曲 (Now Playing):
    ${lastTrack.title} - ${lastTrack.artist} (BPM: ${lastTrack.bpm}, Key: ${lastTrack.key}, Energy: ${lastTrack.energy}, Genre: ${lastTrack.genre})

    请从下方的【候选列表】中，挑选 2 首最佳的下一首歌 (Next Track)。
    
    筛选逻辑：
    1. 调性 (Key): 优先 Camelot Wheel 兼容 (同调、相邻调)。
    2. 速度 (BPM): 优先接近或倍速/半速。
    3. 能量 (Energy): 保持流畅或适度提升/降低。

    【候选列表】:
    ${candidateListText}

    请返回 JSON 格式:
    {
      "suggestions": [
        { "trackId": "提取对应ID", "reasoning": "中文推荐理由" },
        { "trackId": "提取对应ID", "reasoning": "中文推荐理由" }
      ]
    }
  `;

  try {
    const response = await withTimeout(
        ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        suggestions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    trackId: { type: Type.STRING },
                                    reasoning: { type: Type.STRING }
                                }
                            }
                        }
                    }
                }
            }
        }) as Promise<GenerateContentResponse>
    );

    // Safety check: ensure candidates exist
    if (!response.candidates || response.candidates.length === 0) {
        return JSON.stringify({ error: "AI 未返回任何候选结果 (Safety Filter)" });
    }

    return response.text || "{}";
  } catch (error: any) {
    console.error("Gemini Error:", error);
    return JSON.stringify({ suggestions: [], error: error.message || "AI Service Timeout" });
  }
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
  `;

  try {
    const response = await withTimeout(
        ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                systemInstruction: "你是一个精通各类混音技巧的 DJ 导师。",
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        type: { type: Type.STRING, enum: ["mix", "cut"] },
                        reasoning: { type: Type.STRING }
                    }
                }
            }
        }) as Promise<GenerateContentResponse>, 
        15000 // Increased transition timeout to 15s
    );

    const text = response.text?.trim();
    if (!text) return null;
    return JSON.parse(text) as TransitionAnalysis;
  } catch (error) {
    console.error("AI Transition Analysis Error:", error);
    return null;
  }
};