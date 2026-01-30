import React, { useRef, useState } from 'react';
import { Track, TransitionAnalysis, SetType, BridgeRecommendation } from '../types';
import { getGenreCategory } from '../services/trackService';
import { analyzeTrackIssues, StrictnessLevel, calculateHarmonicStatus, parseKey, toCamelotKey } from '../services/analysisService';
import { calculateCueStrategy, calculateTotalSetDuration } from '../services/cueService';
import { getMetricDisplay } from '../services/metricDisplay';
import { formatHeatMeta } from '../services/heatMeta';
import { getSmartBridgeRecommendation } from '../services/geminiService';
import { X, Disc, Activity, Music2, GripVertical, AlertTriangle, Scissors, AudioLines, SlidersHorizontal, Sparkles, Loader2, Zap, Flame, Waves, Minus, TrendingUp, TrendingDown, Tag, Layers, Link, ArrowRightLeft, CheckCircle2, AlertOctagon, ArrowUpRight, ArrowDownRight, ArrowUp, ArrowDown, Target, Timer, Hourglass, Rabbit, Turtle, Wand2, Lightbulb } from 'lucide-react';
import { GlassCard } from './GlassCard';

interface SetBuilderProps {
  setTracks: Track[];
  onRemoveTrack: (id: string) => void;
  onReorderTracks: (startIndex: number, endIndex: number) => void;
  onInsertTrack?: (track: Track, index: number) => void; 
  onAnalyzeTransition: (trackAId: string, trackBId: string) => Promise<TransitionAnalysis | null>;
  setType: SetType;
  onGenreClick: (genre: string) => void;
  highlightedCategory: string | null;
  library?: Track[];
  cutModes: Record<string, boolean>; // State for "Cut Mode" (飞歌模式)
  onToggleCutMode: (trackId: string) => void;
}

// Helper: Get Icon for specific issue type / 获取问题类型的图标
const getIssueIcon = (type: string) => {
    switch (type) {
        case 'harmonic': return <AlertOctagon className="w-3 h-3" />;
        case 'bpm': return <AlertTriangle className="w-3 h-3" />;
        case 'energy': return <Zap className="w-3 h-3" />;
        case 'flow': return <Activity className="w-3 h-3" />;
        case 'genre': return <Layers className="w-3 h-3" />;
        case 'meta': return <Target className="w-3 h-3" />;
        default: return <AlertTriangle className="w-3 h-3" />;
    }
};

// Helper: Styling for severity badges / 严重程度徽章样式
const getSeverityBadgeStyles = (s: string) => {
    switch(s) {
        case 'critical': return 'bg-red-500/20 text-red-300 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]';
        case 'warning': return 'bg-amber-500/20 text-amber-300 border-amber-500/50';
        case 'info': return 'bg-dj-primary/20 text-dj-primary border-dj-primary/40';
        case 'success': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
        default: return 'bg-slate-700 text-slate-300';
    }
};

const getCardBackgroundTint = (issues: any[]) => {
    if (issues.some(i => i.severity === 'critical')) return 'bg-red-900/10 border-l-red-500';
    if (issues.some(i => i.severity === 'warning')) return 'bg-amber-900/10 border-l-amber-500';
    if (issues.some(i => i.severity === 'success')) return 'bg-emerald-900/10'; 
    if (issues.some(i => i.severity === 'info')) return 'bg-dj-primary/10';
    return '';
};

// Helper: Play Strategy Icons / 播放策略图标
const getStrategyIcon = (type: string) => {
    switch(type) {
        case 'quick': return <Rabbit className="w-3 h-3" />;
        case 'extended': return <Waves className="w-3 h-3" />;
        case 'full': return <Hourglass className="w-3 h-3" />;
        default: return <Timer className="w-3 h-3" />;
    }
};

export const SetBuilder: React.FC<SetBuilderProps> = ({ 
    setTracks, 
    onRemoveTrack, 
    onReorderTracks, 
    onInsertTrack, 
    onAnalyzeTransition, 
    setType, 
    onGenreClick, 
    highlightedCategory, 
    library = [],
    cutModes,
    onToggleCutMode
}) => {
  // --- State Management (状态管理) ---
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [strictness, setStrictness] = useState<StrictnessLevel>('standard');
  const [analysisResults, setAnalysisResults] = useState<Record<string, TransitionAnalysis>>({});
  const [analyzingTransitions, setAnalyzingTransitions] = useState<Record<string, boolean>>({});
  const [bridgeRecommendations, setBridgeRecommendations] = useState<Record<string, BridgeRecommendation>>({});
  const [findingBridge, setFindingBridge] = useState<Record<string, boolean>>({});

  const estimatedTotalTime = calculateTotalSetDuration(setTracks, setType);

  const resolveBridgeTrack = (rec: BridgeRecommendation) => {
      const rawId = rec.trackId ? rec.trackId.replace(/^\s*ID[:#]?\s*/i, '').trim() : '';
      if (rawId) {
          const byId = library.find(t => t.id === rawId);
          if (byId) return byId;
      }
      const rawTitle = rec.suggestionTitle ? rec.suggestionTitle.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim().toLowerCase() : '';
      if (rawTitle) {
          const byTitle = library.find(t => t.title.trim().toLowerCase() === rawTitle);
          if (byTitle) return byTitle;
      }
      return null;
  };

  // --- Drag & Drop Handlers (拖拽处理) ---
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, index: number, track: Track) => {
    const transferId = track.sourceId || track.id;
    event.dataTransfer.setData('text/plain', transferId);
    event.dataTransfer.setData('application/x-track-id', transferId);
    event.dataTransfer.effectAllowed = 'move';
    setDraggedIndex(index);
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverItem.current !== null && draggedIndex !== dragOverItem.current) {
      onReorderTracks(draggedIndex, dragOverItem.current);
    }
    setDraggedIndex(null);
    dragOverItem.current = null;
  };

  // --- AI Logic (AI 逻辑) ---
  const handleAiTransitionClick = async (prevTrackId: string, currentTrackId: string) => {
      setAnalyzingTransitions(prev => ({ ...prev, [currentTrackId]: true }));
      try {
          const result = await onAnalyzeTransition(prevTrackId, currentTrackId);
          if (result) {
              setAnalysisResults(prev => ({ ...prev, [currentTrackId]: result }));
              
              // Auto-toggle cut mode if suggested / 如果建议飞歌，自动切换模式
              const isCurrentlyCut = cutModes[currentTrackId] || false;
              if (result.type === 'cut' && !isCurrentlyCut) {
                  onToggleCutMode(currentTrackId);
              } else if (result.type === 'mix' && isCurrentlyCut) {
                  onToggleCutMode(currentTrackId);
              }
          }
      } catch (e) {
          console.error(e);
      } finally {
          setAnalyzingTransitions(prev => ({ ...prev, [currentTrackId]: false }));
      }
  };

  const handleFindBridge = async (track: Track, prevTrack: Track) => {
      if (!prevTrack) return;
      
      const key = track.id;
      setFindingBridge(prev => ({ ...prev, [key]: true }));
      setBridgeRecommendations(prev => {
          const newState = { ...prev };
          delete newState[key]; 
          return newState;
      });

      try {
          const result = await getSmartBridgeRecommendation(prevTrack, track, library);
          if (result) {
              setBridgeRecommendations(prev => ({ ...prev, [key]: result }));
          }
      } catch (e) {
          console.error("Failed to find bridge", e);
      } finally {
          setFindingBridge(prev => ({ ...prev, [key]: false }));
      }
  };

  const handleApplyBridgeTrack = (rec: BridgeRecommendation, index: number) => {
      if (rec.type !== 'track' || !onInsertTrack) return;
      const trackToAdd = resolveBridgeTrack(rec);
      if (trackToAdd) {
          onInsertTrack(trackToAdd, index);
          setBridgeRecommendations(prev => ({ ...prev }));
      } else {
          console.warn("Bridge track not found in library:", rec);
      }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* --- Header Bar (顶部栏) --- */}
      <div className="mb-4 flex items-center justify-between">
        <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Disc className="w-6 h-6 text-dj-accent" />
            Current Set (当前编排)
            </h2>
            <div className="text-slate-400 text-sm flex items-center gap-3 mt-1">
                <span>{setTracks.length} Tracks</span>
                <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                <span className="flex items-center gap-1 text-emerald-400 font-mono">
                    <Timer className="w-3.5 h-3.5" />
                    Est. {estimatedTotalTime}
                </span>
            </div>
        </div>

        <div className="flex items-center gap-2">
            {/* Harmonic Strictness Toggle (调性严谨度切换) */}
            <GlassCard className="flex items-center gap-2 p-1 rounded-full">
                <div className="px-2 text-xs text-slate-500 font-bold flex items-center gap-1">
                    <SlidersHorizontal className="w-3 h-3" />
                    Keys:
                </div>
                <div className="flex glass-pill rounded-full p-0.5">
                    {(['strict', 'standard', 'loose'] as const).map(level => (
                        <button
                            key={level}
                            onClick={() => setStrictness(level)}
                            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                                strictness === level 
                                ? 'btn-primary text-slate-900 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            {level === 'strict' ? 'Strict' : level === 'standard' ? 'Std' : 'Loose'}
                        </button>
                    ))}
                </div>
            </GlassCard>
        </div>
      </div>

      {/* --- Track List (歌曲列表) --- */}
      <div className="flex-1 overflow-y-auto pr-2 space-y-2 pb-20 custom-scrollbar">
        {setTracks.length === 0 ? (
          <GlassCard className="flex flex-col items-center justify-center h-64 text-slate-500 border-2 border-dashed border-white/10 rounded-xl">
            <Music2 className="w-12 h-12 mb-2 opacity-50" />
            <p>Drag tracks from library or click "+" (从曲库拖拽或点击+号)</p>
          </GlassCard>
        ) : (
          setTracks.map((track, index) => {
            const prevTrack = index > 0 ? setTracks[index - 1] : null;
            const isDragging = draggedIndex === index;

            // --- Analysis Logic (分析逻辑) ---
            const issues = analyzeTrackIssues(track, index, setTracks, setType, strictness, cutModes);
            const cueStrategy = calculateCueStrategy(track, setType);
            
            const hasKeys = Boolean(prevTrack?.key && track.key);
            const harmonicStatus = prevTrack && hasKeys
                ? calculateHarmonicStatus(prevTrack.key, track.key, strictness)
                : 'exact';
            const displayKey = track.key ? (toCamelotKey(track.key) || track.key) : '—';
            const displayPrevKey = prevTrack && prevTrack.key ? (toCamelotKey(prevTrack.key) || prevTrack.key) : null;
            const isCutMode = cutModes[track.id] || false;
            const aiAnalysis = analysisResults[track.id];
            const isAnalyzing = analyzingTransitions[track.id];
            const bridgeRec = bridgeRecommendations[track.id];
            const isFindingBridge = findingBridge[track.id];
            const resolvedBridgeTrack = bridgeRec?.type === 'track' ? resolveBridgeTrack(bridgeRec) : null;
            
            // Highlight Logic / 高亮逻辑
            const trackCategory = getGenreCategory(track.genre ?? '');
            const isGenreMatch = highlightedCategory === trackCategory;
            const isGenreDimmed = highlightedCategory !== null && !isGenreMatch;
            const displayGenre = track.status === 'failed' ? 'Failed' : (track.genre || '—');

            // BPM Compatibility / BPM 兼容性
            let bpmDiff = 0;
            let isDoubleTime = false;
            let isBpmClose = true;
            if (prevTrack) {
                if (typeof track.bpm === 'number' && typeof prevTrack.bpm === 'number') {
                    bpmDiff = track.bpm - prevTrack.bpm;
                    isDoubleTime = Math.abs(prevTrack.bpm - track.bpm * 2) <= 5 || Math.abs(prevTrack.bpm * 2 - track.bpm) <= 5;
                    isBpmClose = Math.abs(bpmDiff) <= 6;
                }
            }
            const isMixable = isBpmClose || isDoubleTime;

            // --- Style Calculation (样式计算) ---
            let baseBorderClass = 'border-l-transparent hover:border-l-dj-accent'; 
            let connectorColor = 'bg-slate-700';

            if (index > 0) {
                if (isCutMode) {
                    baseBorderClass = 'border-l-slate-500';
                    connectorColor = 'bg-slate-500';
                } else {
                    if (!isMixable) { baseBorderClass = 'border-l-amber-500'; connectorColor = 'bg-amber-500/50'; }
                    else if (harmonicStatus === 'clash') { baseBorderClass = 'border-l-dj-danger'; connectorColor = 'bg-dj-danger'; }
                    else { baseBorderClass = 'border-l-dj-success'; connectorColor = 'bg-dj-success'; }
                }
            }

            const issueTint = getCardBackgroundTint(issues);
            
            if (issues.some(i => i.severity === 'critical') && !isCutMode) {
                baseBorderClass = 'border-l-red-500';
            }

            const containerStyle = isDragging 
                ? 'opacity-50 scale-95' 
                : isGenreDimmed 
                    ? 'opacity-30 grayscale' 
                    : 'opacity-100';

            const highlightClass = isGenreMatch 
                ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-[#0f172a] shadow-[0_0_15px_rgba(99,102,241,0.3)]' 
                : '';

            // --- Resonance Coloring Logic (共鸣着色逻辑) ---
            // Matches the EnergyChart gradients / 与能量图表的颜色保持一致
            const getResonanceColor = (r: number) => {
                 if (r >= 10) return { text: 'text-fuchsia-400 font-bold', fill: 'fill-fuchsia-500/20' }; // Anthem
                 if (r >= 8) return { text: 'text-rose-500 font-bold', fill: 'fill-rose-500/20' }; // Hit
                 if (r >= 6) return { text: 'text-amber-400 font-medium', fill: 'fill-amber-500/20' }; // Pop
                 if (r >= 4) return { text: 'text-dj-accent', fill: '' }; // Standard
                 return { text: 'text-slate-600', fill: '' }; // Deep/Low
            };

            const energyDisplay = getMetricDisplay({
                status: track.status ?? 'ok',
                value: track.energy,
                error: track.error ?? null
            });
            const resonanceDisplay = getMetricDisplay({
                status: track.heatStatus ?? 'ok',
                value: track.resonance,
                error: track.heatError ?? null
            });
            const heatMetaLabel = formatHeatMeta({ heatSource: track.heatSource, heatScoreRaw: track.heatScoreRaw });
            const hasHeatMeta = Boolean(track.heatSource) || (typeof track.heatScoreRaw === 'number' && Number.isFinite(track.heatScoreRaw));
            const heatReady = resonanceDisplay.state === 'ok';
            const resonanceValue = resonanceDisplay.value ?? 5;
            const resStyle = heatReady ? getResonanceColor(resonanceValue) : { text: 'text-slate-500', fill: '' };
            const isLowResonance = heatReady ? resonanceValue < 3 : false; 
            const energyReady = energyDisplay.state === 'ok';
            const energyValue = energyDisplay.value ?? 5;
            const isHighEnergy = energyReady ? energyValue > 7 : false;
            const isLowEnergy = energyReady ? energyValue < 4 : false;

            // --- Connector Badges (连接线徽章) ---
            let harmonicBadge = null;
            if (index > 0 && prevTrack) {
                 if (isCutMode) {
                     harmonicBadge = (
                        <span className="text-[10px] bg-slate-600 text-slate-200 px-2 py-0.5 rounded border border-slate-500 shadow-sm flex items-center gap-1">
                            <Scissors className="w-2.5 h-2.5" /> Cut (切歌)
                        </span>
                     );
                 } else if (harmonicStatus === 'clash') {
                    // Clash handles inside card
                    harmonicBadge = null;
                 } else if (isMixable) { 
                     const actualEnergyDiff = track.energy - prevTrack.energy;
                     let label = 'Harmonic (和谐)';
                     let Icon = CheckCircle2;
                     let colorClass = 'bg-dj-primary/20 text-dj-primary border-dj-primary/30'; 

                     if (actualEnergyDiff >= 2) {
                        label = 'Energy Lift (提升)'; Icon = TrendingUp; colorClass = 'bg-dj-accent/20 text-dj-accent border-dj-accent/30';
                     } else if (actualEnergyDiff <= -2) {
                        label = 'Energy Drop (回落)'; Icon = TrendingDown; colorClass = 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20';
                     } else if (isDoubleTime) {
                         label = 'Double Time (倍速)'; Icon = Zap; colorClass = 'bg-purple-500/20 text-purple-400 border-purple-500/20';
                     } else {
                         const k1 = displayPrevKey ? parseKey(displayPrevKey) : null;
                         const k2 = parseKey(displayKey);
                         if (k1 && k2) {
                            if (k1.num === k2.num && k1.letter === k2.letter) {
                                label = 'Perfect Match (叠歌)'; Icon = Link; colorClass = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20';
                            } else if (k1.num === k2.num && k1.letter !== k2.letter) {
                                label = 'Mood Shift (情绪)'; Icon = ArrowRightLeft; colorClass = 'bg-teal-500/20 text-teal-400 border-teal-500/20';
                            } else {
                                let diff = k2.num - k1.num;
                                if (diff === -11) diff = 1; if (diff === 11) diff = -1;
                                if (diff === 1 || diff === 2) {
                                    label = 'Energy Boost (推进)'; Icon = ArrowUpRight; colorClass = 'bg-dj-primary/20 text-dj-primary border-dj-primary/30';
                                } else if (diff === -1 || diff === -2) {
                                    label = 'Energy Cool (收敛)'; Icon = ArrowDownRight; colorClass = 'bg-slate-500/20 text-slate-400 border-slate-500/20';
                                }
                            }
                         }
                     }
                     
                     harmonicBadge = (
                         <span className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 ${colorClass}`}>
                             <Icon className="w-3 h-3" /> {label}
                         </span>
                     );
                 }
            }

            return (
              <div 
                key={`${track.id}-${index}`} 
                className={`relative group transition-all duration-300 ${containerStyle}`}
                draggable
                onDragStart={(e) => handleDragStart(e, index, track)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
              >
                {/* Connector Line (左侧连接线) */}
                {index > 0 && prevTrack && (
                  <div className="absolute -top-3 left-0 w-full flex justify-center z-10 h-6 pointer-events-none">
                       <div className={`h-full w-0.5 ml-8 absolute left-0 ${connectorColor} opacity-60 transition-colors duration-300`}></div>
                       {/* Cut Mode Toggle */}
                       <button 
                         onClick={() => onToggleCutMode(track.id)}
                         className={`absolute left-6 -top-1 pointer-events-auto transform hover:scale-110 transition-all rounded-full p-1 border shadow-sm flex items-center justify-center z-20
                            ${isCutMode ? 'bg-slate-700 border-slate-500 text-slate-300' : 'bg-slate-800 border-slate-600 text-slate-500 hover:text-white'}`}
                       >
                            {isCutMode ? <Scissors className="w-3 h-3" /> : <AudioLines className="w-3 h-3" />}
                       </button>
                        {/* AI Analyze Button */}
                        <button
                            onClick={() => handleAiTransitionClick(prevTrack.id, track.id)}
                            className="absolute left-[3.5rem] -top-1 pointer-events-auto transform hover:scale-110 transition-all rounded-full p-1 border border-indigo-500/30 bg-indigo-900/50 text-indigo-300 shadow-sm flex items-center justify-center z-20 hover:bg-indigo-600 hover:text-white"
                        >
                            {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        </button>
                  </div>
                )}
                
                {/* Track Card (歌曲卡片) */}
                <GlassCard className={`hover:bg-slate-800/70 transition-colors rounded-lg p-3 flex flex-col gap-2 border-l-4 shadow-sm relative cursor-grab active:cursor-grabbing mt-1
                    ${baseBorderClass} ${issueTint} ${highlightClass}
                `}>
                  <div className="flex items-center gap-4">
                      {/* Handle & Index */}
                      <div className="flex flex-col items-center justify-center w-6 text-slate-500">
                        <GripVertical className="w-4 h-4 opacity-0 group-hover:opacity-50 mb-1" />
                        <span className="font-mono text-xs">{index + 1}</span>
                      </div>

                      <img
                        src={track.coverUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="%2320283a"/></svg>'}
                        alt="cover"
                        className="w-12 h-12 rounded bg-slate-700 object-cover pointer-events-none"
                      />

                      <div className="flex-1 min-w-0 pointer-events-none select-none flex flex-col gap-1">
                        
                        {/* AI Analysis Result */}
                        {aiAnalysis && (
                            <div className={`text-[10px] px-2 py-1.5 mb-1 rounded-md shadow-sm border backdrop-blur-md flex flex-col gap-0.5 w-full md:w-fit animate-in fade-in slide-in-from-top-1 duration-200
                                ${aiAnalysis.type === 'cut' ? 'bg-orange-900/40 text-orange-200 border-orange-500/30' : 'bg-indigo-900/40 text-indigo-200 border-indigo-500/30'}`}>
                                <div className="font-bold flex items-center gap-1.5">
                                    <Sparkles className="w-3 h-3" /> 
                                    <span>AI Suggestion: {aiAnalysis.type === 'cut' ? 'Cut (飞歌)' : 'Mix (混音)'}</span>
                                </div>
                                <div className="opacity-90 leading-snug whitespace-normal break-words">{aiAnalysis.reasoning}</div>
                            </div>
                        )}

                        <div className="flex items-baseline justify-between">
                          <h3 className="font-semibold text-white truncate max-w-[200px]">{track.title}</h3>
                          <div className="flex items-center gap-1">
                              {/* Genre Tag */}
                              <span 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const newGenre = isGenreMatch ? null : track.genre; 
                                    onGenreClick(newGenre || '');
                                }}
                                className={`text-[10px] px-1.5 py-0.5 rounded ml-2 cursor-pointer pointer-events-auto transition-all border flex items-center gap-1
                                    ${isGenreMatch 
                                        ? 'bg-indigo-500 text-white border-indigo-400 font-bold' 
                                        : 'bg-slate-700/50 text-slate-400 border-transparent hover:border-slate-500 hover:text-slate-200 hover:bg-slate-700'
                                    }`}
                                title={isGenreMatch ? "Unhighlight" : `Highlight ${trackCategory}`}
                              >
                                {isGenreMatch && <Tag className="w-2.5 h-2.5" />}
                                {displayGenre}
                              </span>

                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ml-1 ${displayKey.includes('A') ? 'bg-dj-accent/10 text-dj-accent' : 'bg-dj-primary/10 text-dj-primary'}`}>
                                {displayKey}
                              </span>
                          </div>
                        </div>
                        
                        <p className="text-sm text-slate-400 truncate">{track.artist}</p>
                        
                        {/* Metrics Row */}
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          <span className={`flex items-center gap-1 ${index > 0 && !isMixable ? 'text-amber-500 font-medium' : ''}`}>
                            {index > 0 && !isMixable ? <AlertTriangle className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                            {typeof track.bpm === 'number' ? `${track.bpm} BPM` : '— BPM'}
                          </span>

                          {/* Combined Metric View: Energy | Resonance */}
                          {/* 组合视图：能量 | 共鸣 */}
                          <div className={`flex items-center gap-2 px-1.5 py-0.5 rounded border transition-colors ${
                             isLowResonance 
                                ? 'bg-slate-900/30 border-slate-800 text-slate-600' 
                                : 'bg-slate-800/50 border-slate-700/50' 
                          }`} title="Energy | Resonance">
                                {/* Energy */}
                                <div className={`flex items-center gap-1 ${
                                    isHighEnergy ? 'text-yellow-400 font-bold' : 
                                    isLowEnergy ? 'text-dj-accent' : 'text-slate-300'
                                }`}>
                                    <Zap className={`w-3 h-3 ${isHighEnergy ? 'fill-yellow-500/20' : ''}`} />
                                    <span>{energyDisplay.state === 'pending' ? <Loader2 className="w-3 h-3 animate-spin" /> : energyDisplay.label}</span>
                                </div>
                                
                                <span className="text-slate-700/50">|</span>
                                
                                {/* Resonance (Dynamic Color) */}
                                <div className={`flex items-center gap-1 ${resStyle.text}`}>
                                    <Flame className={`w-3 h-3 ${resStyle.fill}`} />
                                    <span title={(resonanceDisplay.reason || '共鸣') + (hasHeatMeta ? ` | ${heatMetaLabel}` : '')}>
                                        {resonanceDisplay.state === 'pending' ? <Loader2 className="w-3 h-3 animate-spin" /> : resonanceDisplay.label}
                                    </span>
                                </div>
                          </div>
                          
                          {/* Cue Strategy */}
                          <div className="flex items-center gap-1.5 ml-2 border-l border-slate-700 pl-3">
                            <span className="opacity-50 line-through text-[10px]">{track.duration}</span>
                            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                                cueStrategy.type === 'quick' ? 'bg-indigo-900/30 text-indigo-300 border-indigo-500/30' :
                                cueStrategy.type === 'extended' ? 'bg-amber-900/30 text-amber-300 border-amber-500/30' :
                                cueStrategy.type === 'full' ? 'bg-emerald-900/30 text-emerald-300 border-emerald-500/30' :
                                'bg-slate-700/50 text-slate-300 border-slate-600'
                            }`} title={cueStrategy.description}>
                                {getStrategyIcon(cueStrategy.type)}
                                {cueStrategy.formattedDuration}
                            </div>
                            {cueStrategy.type !== 'standard' && (
                                <span className="text-[9px] text-slate-500 hidden lg:inline-block">({cueStrategy.label})</span>
                            )}
                          </div>
                        </div>

                        {/* Issue Badges */}
                        {issues.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2 pointer-events-auto">
                                {issues.map((issue) => {
                                    const canFix = (issue.type === 'harmonic' || issue.type === 'bpm') && index > 0 && prevTrack;
                                    
                                    return (
                                        <div key={issue.id} className="flex items-center gap-1">
                                            <div className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 w-fit animate-in fade-in zoom-in duration-300
                                                ${getSeverityBadgeStyles(issue.severity)}`}
                                            >
                                                {getIssueIcon(issue.type)}
                                                {issue.message}
                                            </div>
                                            
                                            {/* Fix Button (Magic Wand) */}
                                            {canFix && prevTrack && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleFindBridge(track, prevTrack); }}
                                                    className={`p-0.5 rounded border transition-colors
                                                        ${isFindingBridge ? 'bg-slate-700 text-slate-400 border-slate-600' : 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400 hover:bg-indigo-600 hover:text-white'}
                                                    `}
                                                    title="Fix: Find Bridge Track / 智能修复"
                                                    disabled={isFindingBridge}
                                                >
                                                    {isFindingBridge ? <Loader2 className="w-3 h-3 animate-spin"/> : <Wand2 className="w-3 h-3" />}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        
                        {/* Bridge Suggestions */}
                        {bridgeRec && (
                            <div className="mt-2 bg-slate-900/60 border border-indigo-500/40 rounded-md p-2 animate-in slide-in-from-top-2 fade-in relative overflow-hidden group/bridge pointer-events-auto">
                                <div className="absolute top-0 right-0 p-1">
                                    <button onClick={() => setBridgeRecommendations(prev => { const n = {...prev}; delete n[track.id]; return n;})} className="text-slate-500 hover:text-white"><X className="w-3 h-3"/></button>
                                </div>
                                <div className="flex items-start gap-2">
                                    {bridgeRec.type === 'track' ? (
                                        <div className="bg-indigo-500/20 p-1.5 rounded-full text-indigo-300 border border-indigo-500/30">
                                            <Link className="w-4 h-4" />
                                        </div>
                                    ) : (
                                        <div className="bg-amber-500/20 p-1.5 rounded-full text-amber-300 border border-amber-500/30">
                                            <Lightbulb className="w-4 h-4" />
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className={`text-[10px] font-bold px-1 rounded uppercase ${bridgeRec.type === 'track' ? 'bg-indigo-500 text-white' : 'bg-amber-500 text-black'}`}>
                                                {bridgeRec.type === 'track' ? 'Suggestion (推荐)' : 'Technique (技巧)'}
                                            </span>
                                            <span className="text-xs font-bold text-slate-200 truncate">{bridgeRec.suggestionTitle}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 leading-snug">{bridgeRec.reasoning}</p>
                                        
                                        {/* Insert Button */}
                                        {bridgeRec.type === 'track' && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleApplyBridgeTrack(bridgeRec, index); }}
                                                disabled={!resolvedBridgeTrack}
                                                className="mt-2 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded flex items-center gap-1 transition-colors w-full justify-center font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                               <ArrowDown className="w-3 h-3" /> Insert Above (插入上方)
                                            </button>
                                        )}
                                        {bridgeRec.type === 'track' && !resolvedBridgeTrack && (
                                            <p className="mt-1 text-[10px] text-amber-400">未在曲库中找到该歌曲，请重新生成建议。</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                      </div>

                      <button 
                        onClick={(e) => { e.stopPropagation(); onRemoveTrack(track.id); }}
                        className="p-2 text-slate-500 hover:text-dj-danger hover:bg-dj-danger/10 rounded-full transition-colors ml-2 z-20 self-start"
                      >
                        <X className="w-4 h-4" />
                      </button>
                  </div>
                </GlassCard>
                
                {/* Floating Badge (悬浮徽章) */}
                {index > 0 && harmonicBadge && (
                   <div className="absolute -top-3 left-28 z-30 pointer-events-none flex items-center">
                        {harmonicBadge}
                   </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
