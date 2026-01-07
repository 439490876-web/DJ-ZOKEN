import React, { useRef, useState } from 'react';
import { Track, TransitionAnalysis, SetType } from '../types';
import { X, Disc, Activity, Music2, GripVertical, AlertTriangle, Scissors, AudioLines, SlidersHorizontal, Sparkles, Loader2, Zap, Flame, Snowflake, Waves, Minus, TrendingUp, TrendingDown, Tag } from 'lucide-react';

interface SetBuilderProps {
  setTracks: Track[];
  onRemoveTrack: (id: string) => void;
  onReorderTracks: (startIndex: number, endIndex: number) => void;
  onAnalyzeTransition: (trackAId: string, trackBId: string) => Promise<TransitionAnalysis | null>;
  setType: SetType;
}

type StrictnessLevel = 'strict' | 'standard' | 'loose';
type Severity = 'critical' | 'warning' | 'info' | 'success';

interface SetIssue {
    severity: Severity;
    message: string;
    icon: React.ReactNode;
}

// Helper to parse Camelot keys (e.g. "11B", "2A")
const parseKey = (key: string) => {
    const match = key.match(/^(\d+)([AB])$/);
    if (!match) return null;
    return { num: parseInt(match[1], 10), letter: match[2] };
};

// Dynamic compatibility checker based on strictness level
const calculateHarmonicStatus = (keyA: string, keyB: string, strictness: StrictnessLevel): 'exact' | 'compatible' | 'clash' => {
    if (keyA === keyB) return 'exact';
    
    const k1 = parseKey(keyA);
    const k2 = parseKey(keyB);
    
    if (!k1 || !k2) return 'clash'; // Fallback for invalid keys

    const numDiff = Math.abs(k1.num - k2.num);
    // Calculate shortest distance on the clock (e.g., 12 -> 1 is distance 1)
    const circleDiff = Math.min(numDiff, 12 - numDiff);

    // 0 Distance: Same Number (e.g., 8A -> 8A or 8A -> 8B)
    if (circleDiff === 0) {
        if (k1.letter === k2.letter) return 'exact';
        return 'compatible';
    }

    // 1 Distance: +/- 1 Step (e.g., 8A -> 9A)
    if (circleDiff === 1) {
        if (strictness === 'strict') return 'clash';
        if (k1.letter === k2.letter) return 'compatible';
        if (strictness === 'loose') return 'compatible';
    }

    // 2 Distance: +/- 2 Steps (Energy Boost)
    if (circleDiff === 2) {
        if (strictness === 'loose') return 'compatible';
    }

    return 'clash';
};

// Advanced Context Analysis
const getContextIssues = (track: Track, index: number, allTracks: Track[], setType: SetType): SetIssue[] => {
    const issues: SetIssue[] = [];
    const prevTrack = index > 0 ? allTracks[index - 1] : null;

    // --- 1. Dynamic Energy Flow Checks ---
    if (prevTrack) {
        const energyDiff = track.energy - prevTrack.energy;
        
        // Sudden Jumps (>3 is significant on 1-10 scale)
        if (energyDiff >= 4) {
             issues.push({ 
                severity: 'warning', 
                message: `能量突增 (+${energyDiff})`, 
                icon: <TrendingUp className="w-3 h-3" /> 
            });
        } else if (energyDiff <= -4) {
             issues.push({ 
                severity: 'info', 
                message: `能量骤降 (${energyDiff})`, 
                icon: <TrendingDown className="w-3 h-3" /> 
            });
        }
    }

    // Rollercoaster Check (V-Shape or A-Shape)
    if (index >= 2) {
        const prev1 = allTracks[index - 1];
        const prev2 = allTracks[index - 2];
        const diff1 = track.energy - prev1.energy;
        const diff2 = prev1.energy - prev2.energy;

        // If direction flips AND magnitude is significant
        if ((diff1 > 0) !== (diff2 > 0) && Math.abs(diff1) >= 3 && Math.abs(diff2) >= 3) {
            issues.push({ 
                severity: 'critical', 
                message: '能量过山车 (不稳定)', 
                icon: <Activity className="w-3 h-3" /> 
            });
        }
    }

    // Flatness Check (Last 4 tracks)
    if (index >= 3) {
        const window = [track, allTracks[index-1], allTracks[index-2], allTracks[index-3]];
        const energies = window.map(t => t.energy);
        const max = Math.max(...energies);
        const min = Math.min(...energies);
        
        if (max - min <= 1) {
             issues.push({ 
                severity: 'info', 
                message: '能量缺乏起伏 (太平)', 
                icon: <Minus className="w-3 h-3" /> 
            });
        }
    }

    // --- 2. Set Type Strategy Checks ---
    if (setType === 'warmup') {
        if (track.energy >= 8 || track.resonance >= 9) {
            issues.push({ 
                severity: 'warning', 
                message: '暖场能量过高', 
                icon: <Flame className="w-3 h-3" /> 
            });
        }
    } else if (setType === 'prime') {
        // Fatigue: 3 High Resonance tracks in a row
        if (index >= 2) {
            const prev1 = allTracks[index - 1];
            const prev2 = allTracks[index - 2];
            if (track.resonance >= 9 && prev1.resonance >= 9 && prev2.resonance >= 9) {
                issues.push({ 
                    severity: 'warning', 
                    message: '听觉疲劳预警', 
                    icon: <Waves className="w-3 h-3" /> 
                });
            }
        }
        
        // Breather: Low energy after High energy
        if (track.energy <= 6 && prevTrack && prevTrack.energy >= 9) {
            issues.push({
                severity: 'success',
                message: '呼吸位 (Drop)',
                icon: <Snowflake className="w-3 h-3" />
            });
        }
    } else if (setType === 'closing') {
        if (track.energy >= 9) {
             issues.push({ severity: 'info', message: '收尾能量偏高', icon: <Zap className="w-3 h-3" /> });
        }
    }

    return issues;
};

// Styling Helpers
const getSeverityBadgeStyles = (s: Severity) => {
    switch(s) {
        case 'critical': return 'bg-red-500/20 text-red-300 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]';
        case 'warning': return 'bg-amber-500/20 text-amber-300 border-amber-500/50';
        case 'info': return 'bg-blue-500/20 text-blue-300 border-blue-500/50';
        case 'success': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
    }
};

const getCardBackgroundTint = (issues: SetIssue[]) => {
    if (issues.some(i => i.severity === 'critical')) return 'bg-red-900/10 border-l-red-500';
    if (issues.some(i => i.severity === 'warning')) return 'bg-amber-900/10 border-l-amber-500';
    if (issues.some(i => i.severity === 'success')) return 'bg-emerald-900/10'; // Keep original border logic for flow, just tint bg
    if (issues.some(i => i.severity === 'info')) return 'bg-blue-900/10';
    return '';
};

const SetBuilder: React.FC<SetBuilderProps> = ({ setTracks, onRemoveTrack, onReorderTracks, onAnalyzeTransition, setType }) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [strictness, setStrictness] = useState<StrictnessLevel>('standard');
  const [cutModes, setCutModes] = useState<Record<string, boolean>>({});
  const [analysisResults, setAnalysisResults] = useState<Record<string, TransitionAnalysis>>({});
  const [analyzingTransitions, setAnalyzingTransitions] = useState<Record<string, boolean>>({});
  const [highlightedGenre, setHighlightedGenre] = useState<string | null>(null);

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
            <p className="text-slate-400 text-sm">
            {setTracks.length} 首歌曲 • 约 {setTracks.reduce((acc, t) => acc + parseInt(t.duration.split(':')[0]), 0)} 分钟
            </p>
        </div>

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

      <div className="flex-1 overflow-y-auto pr-2 space-y-2 pb-20">
        {setTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
            <Music2 className="w-12 h-12 mb-2 opacity-50" />
            <p>从左侧曲库拖拽或点击 "+" 添加歌曲</p>
          </div>
        ) : (
          setTracks.map((track, index) => {
            const prevTrack = index > 0 ? setTracks[index - 1] : null;
            const harmonicStatus = prevTrack ? calculateHarmonicStatus(prevTrack.key, track.key, strictness) : 'exact';
            const isCutMode = cutModes[track.id] || false;
            const aiAnalysis = analysisResults[track.id];
            const isAnalyzing = analyzingTransitions[track.id];
            const issues = getContextIssues(track, index, setTracks, setType);
            
            // Genre Highlight Logic
            const isGenreMatch = highlightedGenre === track.genre;
            const isGenreDimmed = highlightedGenre !== null && !isGenreMatch;

            // BPM Calculation
            let bpmDiff = 0;
            let isDoubleTime = false;
            let isBpmClose = true;
            if (prevTrack) {
                bpmDiff = track.bpm - prevTrack.bpm;
                isDoubleTime = Math.abs(prevTrack.bpm - track.bpm * 2) <= 4 || Math.abs(prevTrack.bpm * 2 - track.bpm) <= 4;
                isBpmClose = Math.abs(bpmDiff) <= 6;
            }
            const isBpmWarning = index > 0 && !isBpmClose && !isDoubleTime;
            const isMixable = isBpmClose || isDoubleTime;
            const isDragging = draggedIndex === index;

            // Visual State
            // Default Mix Logic for Border
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

            // Apply Issue Tints
            const issueTint = getCardBackgroundTint(issues);
            
            if (issues.some(i => i.severity === 'critical') && !isCutMode) {
                baseBorderClass = 'border-l-red-500';
            }

            // Apply Genre Highlight Styling
            // If matching genre, add a glow/ring. If not matching (and filter active), dim opacity/saturation.
            const containerStyle = isDragging 
                ? 'opacity-50 scale-95' 
                : isGenreDimmed 
                    ? 'opacity-30 grayscale' 
                    : 'opacity-100';

            const highlightClass = isGenreMatch 
                ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-[#0f172a] shadow-[0_0_15px_rgba(99,102,241,0.3)]' 
                : '';

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

                  <div className="flex-1 min-w-0 pointer-events-none select-none">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-semibold text-white truncate">{track.title}</h3>
                      <div className="flex items-center gap-1">
                          
                          {/* GENRE BADGE */}
                          <span 
                            onClick={(e) => {
                                e.stopPropagation();
                                setHighlightedGenre(highlightedGenre === track.genre ? null : track.genre);
                            }}
                            className={`text-[10px] px-1.5 py-0.5 rounded ml-2 cursor-pointer pointer-events-auto transition-all border flex items-center gap-1
                                ${isGenreMatch 
                                    ? 'bg-indigo-500 text-white border-indigo-400 font-bold' 
                                    : 'bg-slate-700/50 text-slate-400 border-transparent hover:border-slate-500 hover:text-slate-200 hover:bg-slate-700'
                                }`}
                            title={isGenreMatch ? "取消高亮" : `高亮所有 ${track.genre} 歌曲`}
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
                      <span className={`flex items-center gap-1 ${isBpmWarning ? 'text-amber-500 font-medium' : ''}`}>
                        {isBpmWarning ? <AlertTriangle className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                        {track.bpm} BPM 
                        {index > 0 && bpmDiff !== 0 && (
                            <span className="opacity-75">
                                ({bpmDiff > 0 ? '+' : ''}{bpmDiff})
                                {isDoubleTime && <span className="ml-1 text-dj-accent font-bold">x2</span>}
                            </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-yellow-500" /> {track.energy}
                      </span>
                      <span className="flex items-center gap-1">
                        <Flame className={`w-3 h-3 ${track.resonance > 7 ? 'text-orange-500' : 'text-slate-600'}`} /> {track.resonance}
                      </span>
                      <span>{track.duration}</span>
                    </div>
                  </div>
                  
                  {/* Issue Badges Stack */}
                  {issues.length > 0 && (
                      <div className="absolute top-2 right-12 z-10 pointer-events-none flex flex-col gap-1 items-end">
                        {issues.map((issue, i) => (
                           <div key={i} className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 w-fit backdrop-blur-sm shadow-sm animate-in fade-in slide-in-from-right-1
                            ${getSeverityBadgeStyles(issue.severity)}`}
                          >
                             {issue.icon}
                             {issue.message}
                          </div>
                        ))}
                      </div>
                  )}

                  <button 
                    onClick={(e) => { e.stopPropagation(); onRemoveTrack(track.id); }}
                    className="p-2 text-slate-500 hover:text-dj-danger hover:bg-dj-danger/10 rounded-full transition-colors ml-2 z-20"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Harmonic / Transition Status */}
                {index > 0 && (
                   <div className="absolute -top-3 left-28 z-30 pointer-events-none transition-all duration-300 flex flex-col items-start gap-1">
                       <div className="flex items-center">
                            {isCutMode ? (
                                <span className="text-[10px] bg-slate-600 text-slate-200 px-2 py-0.5 rounded border border-slate-500 shadow-sm flex items-center gap-1">
                                    <Scissors className="w-2.5 h-2.5" /> 切歌
                                </span>
                            ) : (
                                <>
                                    {!isMixable && (
                                        <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1 rounded border border-amber-500/20 flex items-center gap-1 mr-1">
                                            <AlertTriangle className="w-2 h-2" /> BPM 差异大
                                        </span>
                                    )}
                                    {isMixable && (
                                        <>
                                            {harmonicStatus === 'exact' && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1 rounded border border-emerald-500/20 flex items-center gap-1">
                                                {isDoubleTime ? <Zap className="w-2 h-2" /> : null} {isDoubleTime ? '倍速' : '完美'}
                                            </span>}
                                            {harmonicStatus === 'compatible' && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1 rounded border border-blue-500/20">
                                                {isDoubleTime ? '倍速和谐' : '和谐'}
                                            </span>}
                                            {harmonicStatus === 'clash' && <span className="text-[10px] bg-red-500/20 text-red-400 px-1 rounded border border-red-500/20">调性冲突</span>}
                                        </>
                                    )}
                                </>
                            )}
                       </div>
                        {aiAnalysis && (
                            <div className={`text-[10px] px-2 py-1 rounded shadow-lg border backdrop-blur-md animate-in fade-in zoom-in slide-in-from-left-2 duration-300 max-w-[200px]
                                ${aiAnalysis.type === 'cut' ? 'bg-orange-900/80 text-orange-200 border-orange-500/50' : 'bg-indigo-900/80 text-indigo-200 border-indigo-500/50'}`}>
                                <div className="font-bold flex items-center gap-1">
                                    <Sparkles className="w-2 h-2" /> 建议: {aiAnalysis.type === 'cut' ? '飞歌 (Cut)' : '混音 (Mix)'}
                                </div>
                                <div className="opacity-90 leading-tight mt-0.5">{aiAnalysis.reasoning}</div>
                            </div>
                        )}
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

export default SetBuilder;