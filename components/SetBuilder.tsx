import React, { useRef, useState } from 'react';
import { Track, TransitionAnalysis, SetType } from '../types';
import { getGenreCategory } from '../services/trackService';
import { analyzeTrackIssues, StrictnessLevel, calculateHarmonicStatus, parseKey } from '../services/analysisService';
import { calculateCueStrategy, calculateTotalSetDuration } from '../services/cueService';
import { X, Disc, Activity, Music2, GripVertical, AlertTriangle, Scissors, AudioLines, SlidersHorizontal, Sparkles, Loader2, Zap, Flame, Waves, Minus, TrendingUp, TrendingDown, Tag, Layers, Link, ArrowRightLeft, CheckCircle2, AlertOctagon, ArrowUpRight, ArrowDownRight, ArrowUp, ArrowDown, Target, Timer, Hourglass, Rabbit, Turtle } from 'lucide-react';

interface SetBuilderProps {
  setTracks: Track[];
  onRemoveTrack: (id: string) => void;
  onReorderTracks: (startIndex: number, endIndex: number) => void;
  onAnalyzeTransition: (trackAId: string, trackBId: string) => Promise<TransitionAnalysis | null>;
  setType: SetType;
  onGenreClick: (genre: string) => void;
  highlightedCategory: string | null;
}

// Map Issue Types to Icons
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

// Styling Helpers
const getSeverityBadgeStyles = (s: string) => {
    switch(s) {
        case 'critical': return 'bg-red-500/20 text-red-300 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]';
        case 'warning': return 'bg-amber-500/20 text-amber-300 border-amber-500/50';
        case 'info': return 'bg-blue-500/20 text-blue-300 border-blue-500/50';
        case 'success': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
        default: return 'bg-slate-700 text-slate-300';
    }
};

const getCardBackgroundTint = (issues: any[]) => {
    if (issues.some(i => i.severity === 'critical')) return 'bg-red-900/10 border-l-red-500';
    if (issues.some(i => i.severity === 'warning')) return 'bg-amber-900/10 border-l-amber-500';
    if (issues.some(i => i.severity === 'success')) return 'bg-emerald-900/10'; 
    if (issues.some(i => i.severity === 'info')) return 'bg-blue-900/10';
    return '';
};

// Helper for Strategy Icon
const getStrategyIcon = (type: string) => {
    switch(type) {
        case 'quick': return <Rabbit className="w-3 h-3" />;
        case 'extended': return <Waves className="w-3 h-3" />;
        case 'full': return <Hourglass className="w-3 h-3" />;
        default: return <Timer className="w-3 h-3" />;
    }
};

export const SetBuilder: React.FC<SetBuilderProps> = ({ setTracks, onRemoveTrack, onReorderTracks, onAnalyzeTransition, setType, onGenreClick, highlightedCategory }) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [strictness, setStrictness] = useState<StrictnessLevel>('standard');
  const [cutModes, setCutModes] = useState<Record<string, boolean>>({});
  const [analysisResults, setAnalysisResults] = useState<Record<string, TransitionAnalysis>>({});
  const [analyzingTransitions, setAnalyzingTransitions] = useState<Record<string, boolean>>({});

  const estimatedTotalTime = calculateTotalSetDuration(setTracks, setType);

  const handleDragStart = (index: number) => {
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

  const toggleTransitionMode = (trackId: string) => {
    setCutModes(prev => ({ ...prev, [trackId]: !prev[trackId] }));
  };

  const handleAiTransitionClick = async (prevTrackId: string, currentTrackId: string) => {
      setAnalyzingTransitions(prev => ({ ...prev, [currentTrackId]: true }));
      try {
          const result = await onAnalyzeTransition(prevTrackId, currentTrackId);
          if (result) {
              setAnalysisResults(prev => ({ ...prev, [currentTrackId]: result }));
              if (result.type === 'cut') setCutModes(prev => ({ ...prev, [currentTrackId]: true }));
              else if (result.type === 'mix') setCutModes(prev => ({ ...prev, [currentTrackId]: false }));
          }
      } catch (e) {
          console.error(e);
      } finally {
          setAnalyzingTransitions(prev => ({ ...prev, [currentTrackId]: false }));
      }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="mb-4 flex items-center justify-between">
        <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Disc className="w-6 h-6 text-dj-accent" />
            当前编排
            </h2>
            <div className="text-slate-400 text-sm flex items-center gap-3 mt-1">
                <span>{setTracks.length} 首歌曲</span>
                <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                <span className="flex items-center gap-1 text-emerald-400 font-mono">
                    <Timer className="w-3.5 h-3.5" />
                    预计 {estimatedTotalTime}
                </span>
            </div>
        </div>

        <div className="flex items-center gap-2">
            {/* Strictness Control */}
            <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-lg border border-slate-700/50">
                <div className="px-2 text-xs text-slate-500 font-bold flex items-center gap-1">
                    <SlidersHorizontal className="w-3 h-3" />
                    调性:
                </div>
                <div className="flex bg-slate-800 rounded-md p-0.5">
                    {(['strict', 'standard', 'loose'] as const).map(level => (
                        <button
                            key={level}
                            onClick={() => setStrictness(level)}
                            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                                strictness === level 
                                ? 'bg-dj-panel text-white shadow-sm ring-1 ring-white/10' 
                                : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            {level === 'strict' ? '严谨' : level === 'standard' ? '标准' : '宽松'}
                        </button>
                    ))}
                </div>
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-2 pb-20 custom-scrollbar">
        {setTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
            <Music2 className="w-12 h-12 mb-2 opacity-50" />
            <p>从左侧曲库拖拽或点击 "+" 添加歌曲</p>
          </div>
        ) : (
          setTracks.map((track, index) => {
            const prevTrack = index > 0 ? setTracks[index - 1] : null;
            const isDragging = draggedIndex === index;

            // --- Analysis Logic ---
            const issues = analyzeTrackIssues(track, index, setTracks, setType, strictness);
            const cueStrategy = calculateCueStrategy(track, setType);
            
            const harmonicStatus = prevTrack ? calculateHarmonicStatus(prevTrack.key, track.key, strictness) : 'exact';
            const isCutMode = cutModes[track.id] || false;
            const aiAnalysis = analysisResults[track.id];
            const isAnalyzing = analyzingTransitions[track.id];
            
            // Sync highlight
            const trackCategory = getGenreCategory(track.genre);
            const isGenreMatch = highlightedCategory === trackCategory;
            const isGenreDimmed = highlightedCategory !== null && !isGenreMatch;

            // BPM Calc
            let bpmDiff = 0;
            let isDoubleTime = false;
            let isBpmClose = true;
            if (prevTrack) {
                bpmDiff = track.bpm - prevTrack.bpm;
                isDoubleTime = Math.abs(prevTrack.bpm - track.bpm * 2) <= 5 || Math.abs(prevTrack.bpm * 2 - track.bpm) <= 5;
                isBpmClose = Math.abs(bpmDiff) <= 6;
            }
            const isMixable = isBpmClose || isDoubleTime;

            // Energy Diff
            let energyDiff = 0;
            if (prevTrack) {
                energyDiff = track.energy - prevTrack.energy;
            }

            // Visual State
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

            // Harmonic Badge Logic (Same as before)
            let harmonicBadge = null;
            if (index > 0 && prevTrack) {
                 if (isCutMode) {
                     harmonicBadge = (
                        <span className="text-[10px] bg-slate-600 text-slate-200 px-2 py-0.5 rounded border border-slate-500 shadow-sm flex items-center gap-1">
                            <Scissors className="w-2.5 h-2.5" /> 切歌
                        </span>
                     );
                 } else if (harmonicStatus === 'clash') {
                    harmonicBadge = (
                        <span className="text-[10px] bg-red-500/20 text-red-400 px-1 rounded border border-red-500/20 flex items-center gap-1">
                             <AlertOctagon className="w-2.5 h-2.5" /> 调性冲突
                        </span>
                    );
                 } else {
                     const actualEnergyDiff = track.energy - prevTrack.energy;
                     let label = '和谐';
                     let Icon = CheckCircle2;
                     let colorClass = 'bg-blue-500/20 text-blue-400 border-blue-500/20'; 

                     if (actualEnergyDiff >= 2) {
                        label = '能量提升'; Icon = TrendingUp; colorClass = 'bg-cyan-500/20 text-cyan-400 border-cyan-500/20';
                     } else if (actualEnergyDiff <= -2) {
                        label = '能量回落'; Icon = TrendingDown; colorClass = 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20';
                     } else if (isDoubleTime) {
                         label = '倍速混音'; Icon = Zap; colorClass = 'bg-purple-500/20 text-purple-400 border-purple-500/20';
                     } else {
                         const k1 = parseKey(prevTrack.key);
                         const k2 = parseKey(track.key);
                         if (k1 && k2) {
                            if (k1.num === k2.num && k1.letter === k2.letter) {
                                label = '完美叠歌'; Icon = Link; colorClass = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20';
                            } else if (k1.num === k2.num && k1.letter !== k2.letter) {
                                label = '情绪转换'; Icon = ArrowRightLeft; colorClass = 'bg-teal-500/20 text-teal-400 border-teal-500/20';
                            } else {
                                let diff = k2.num - k1.num;
                                if (diff === -11) diff = 1; if (diff === 11) diff = -1;
                                if (diff === 1 || diff === 2) {
                                    label = '调性推进'; Icon = ArrowUpRight; colorClass = 'bg-sky-500/20 text-sky-400 border-sky-500/20';
                                } else if (diff === -1 || diff === -2) {
                                    label = '调性收敛'; Icon = ArrowDownRight; colorClass = 'bg-slate-500/20 text-slate-400 border-slate-500/20';
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
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
              >
                {/* Connector Line */}
                {index > 0 && prevTrack && (
                  <div className="absolute -top-3 left-0 w-full flex justify-center z-10 h-6 pointer-events-none">
                       <div className={`h-full w-0.5 ml-8 absolute left-0 ${connectorColor} opacity-60 transition-colors duration-300`}></div>
                       <button 
                         onClick={() => toggleTransitionMode(track.id)}
                         className={`absolute left-6 -top-1 pointer-events-auto transform hover:scale-110 transition-all rounded-full p-1 border shadow-sm flex items-center justify-center z-20
                            ${isCutMode ? 'bg-slate-700 border-slate-500 text-slate-300' : 'bg-slate-800 border-slate-600 text-slate-500 hover:text-white'}`}
                       >
                            {isCutMode ? <Scissors className="w-3 h-3" /> : <AudioLines className="w-3 h-3" />}
                       </button>
                        <button
                            onClick={() => handleAiTransitionClick(prevTrack.id, track.id)}
                            className="absolute left-[3.5rem] -top-1 pointer-events-auto transform hover:scale-110 transition-all rounded-full p-1 border border-indigo-500/30 bg-indigo-900/50 text-indigo-300 shadow-sm flex items-center justify-center z-20 hover:bg-indigo-600 hover:text-white"
                        >
                            {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        </button>
                  </div>
                )}
                
                <div className={`bg-dj-panel hover:bg-slate-800 transition-colors rounded-lg p-3 flex items-center gap-4 border-l-4 shadow-sm relative cursor-grab active:cursor-grabbing mt-1
                    ${baseBorderClass} ${issueTint} ${highlightClass}
                `}>
                  <div className="flex flex-col items-center justify-center w-6 text-slate-500">
                    <GripVertical className="w-4 h-4 opacity-0 group-hover:opacity-50 mb-1" />
                    <span className="font-mono text-xs">{index + 1}</span>
                  </div>

                  <img src={track.coverUrl} alt="cover" className="w-12 h-12 rounded bg-slate-700 object-cover pointer-events-none" />

                  <div className="flex-1 min-w-0 pointer-events-none select-none flex flex-col gap-1">
                    
                    {aiAnalysis && (
                        <div className={`text-[10px] px-2 py-1.5 mb-1 rounded-md shadow-sm border backdrop-blur-md flex flex-col gap-0.5 w-full md:w-fit animate-in fade-in slide-in-from-top-1 duration-200
                            ${aiAnalysis.type === 'cut' ? 'bg-orange-900/40 text-orange-200 border-orange-500/30' : 'bg-indigo-900/40 text-indigo-200 border-indigo-500/30'}`}>
                            <div className="font-bold flex items-center gap-1.5">
                                <Sparkles className="w-3 h-3" /> 
                                <span>建议: {aiAnalysis.type === 'cut' ? '飞歌 (Cut)' : '混音 (Mix)'}</span>
                            </div>
                            <div className="opacity-90 leading-snug whitespace-normal break-words">{aiAnalysis.reasoning}</div>
                        </div>
                    )}

                    <div className="flex items-baseline justify-between">
                      <h3 className="font-semibold text-white truncate max-w-[200px]">{track.title}</h3>
                      <div className="flex items-center gap-1">
                          
                          {/* GENRE BADGE */}
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
                            title={isGenreMatch ? "取消高亮" : `高亮所有 ${trackCategory} 风格`}
                          >
                             {isGenreMatch && <Tag className="w-2.5 h-2.5" />}
                             {track.genre}
                          </span>

                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ml-1 ${track.key.includes('A') ? 'bg-pink-500/10 text-pink-400' : 'bg-cyan-500/10 text-cyan-400'}`}>
                            {track.key}
                          </span>
                      </div>
                    </div>
                    
                    <p className="text-sm text-slate-400 truncate">{track.artist}</p>
                    
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span className={`flex items-center gap-1 ${index > 0 && !isMixable ? 'text-amber-500 font-medium' : ''}`}>
                        {index > 0 && !isMixable ? <AlertTriangle className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                        {track.bpm} BPM 
                      </span>
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-yellow-500" /> 
                        {track.energy}
                      </span>
                      <span className="flex items-center gap-1">
                        <Flame className={`w-3 h-3 ${track.resonance > 7 ? 'text-orange-500' : 'text-slate-600'}`} /> {track.resonance}
                      </span>
                      
                      {/* DURATION BADGE WITH STRATEGY */}
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

                    {/* ISSUE BADGES */}
                    {issues.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {issues.map((issue) => (
                            <div key={issue.id} className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 w-fit animate-in fade-in zoom-in duration-300
                                ${getSeverityBadgeStyles(issue.severity)}`}
                            >
                                {getIssueIcon(issue.type)}
                                {issue.message}
                            </div>
                            ))}
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
                
                {/* Connector Badge */}
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