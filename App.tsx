import React, { useState, useEffect, useMemo } from 'react';
import { Track, SetList, TransitionAnalysis, SetType, AISuggestion } from './types';
import { trackService, getGenreCategory } from './services/trackService';
import { analyzeTransitionAi, getAiSuggestions } from './services/geminiService';
import { analyzeSet } from './services/analysisService';
import { calculateTotalSetDuration } from './services/cueService';
import EnergyChart from './components/EnergyChart';
import { SetBuilder } from './components/SetBuilder';
import { Search, Library, Plus, Save, RotateCcw, Sunrise, Sun, Sunset, ArrowUp, ArrowDown, Zap, Flame, Activity, Music, X, Tag, Disc, Sparkles, Bot, Loader2, PieChart, Target, Filter, AlertTriangle, CheckCircle2, BarChart3, ScanEye } from 'lucide-react';

type SortKey = 'bpm' | 'key' | 'energy' | 'resonance';
interface SortCriterion {
    key: SortKey;
    order: 'asc' | 'desc';
}

const App: React.FC = () => {
  const [library, setLibrary] = useState<Track[]>([]);
  const [setTracks, setSetTracks] = useState<Track[]>([]);
  const [setType, setSetType] = useState<SetType>('prime');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Sorting State
  const [sortMode, setSortMode] = useState<'single' | 'multi'>('single');
  const [sortCriteria, setSortCriteria] = useState<SortCriterion[]>([]);
  
  // Focus Mode State (Library Filter)
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  // AI Suggestion State
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [isAiSuggesting, setIsAiSuggesting] = useState(false);

  // Load initial data
  useEffect(() => {
    const fetchLibrary = async () => {
      try {
        const data = await trackService.getAllTracks();
        setLibrary(data);
      } catch (err) {
        console.error("Failed to load tracks", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLibrary();
  }, []);

  // Compute unique categories for the filter bar
  const allCategories = useMemo(() => {
      const categories = new Set(library.map(t => getGenreCategory(t.genre)));
      // Logical sort order for DJing
      const order = [
        'House / Disco', 'Techno', 'Trance', 
        'Hip Hop / R&B', 'Pop / Dance', 'Latin', 
        'Bass / DnB', 'Rock / Alt', 'Hard / Festival', 
        'Chill / Jazz', 'Tools', 'Other'
      ];
      return Array.from(categories).sort((a: string, b: string) => {
        const idxA = order.indexOf(a);
        const idxB = order.indexOf(b);
        // Put unknown categories at the end
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
  }, [library]);

  // Statistics Calculation
  const averageEnergy = useMemo(() => {
      if (setTracks.length === 0) return '0.0';
      const total = setTracks.reduce((sum, t) => sum + t.energy, 0);
      return (total / setTracks.length).toFixed(1);
  }, [setTracks]);

  const estimatedTotalTime = useMemo(() => {
      return calculateTotalSetDuration(setTracks, setType);
  }, [setTracks, setType]);

  const genreStats = useMemo(() => {
      const total = setTracks.length;
      if (total === 0) return [];
      const counts: Record<string, number> = {};
      setTracks.forEach(t => {
          const cat = getGenreCategory(t.genre);
          counts[cat] = (counts[cat] || 0) + 1;
      });
      return Object.entries(counts)
          .map(([name, count]) => ({ name, count, percent: Math.round((count/total)*100) }))
          .sort((a,b) => b.count - a.count);
  }, [setTracks]);

  // Global Issues Analysis
  const globalIssues = useMemo(() => {
      return analyzeSet(setTracks, setType, 'standard');
  }, [setTracks, setType]);

  const issueCount = globalIssues.filter(i => i.severity === 'critical' || i.severity === 'warning').length;

  const addToSet = (track: Track) => {
    const newTrack = { ...track, id: `${track.id}-${crypto.randomUUID()}` }; 
    setSetTracks([...setTracks, newTrack]);
    // Optionally clear suggestions after adding one
    setAiSuggestions(prev => prev.filter(s => s.trackId !== track.id));
  };

  const removeFromSet = (instanceId: string) => {
    setSetTracks(setTracks.filter(t => t.id !== instanceId));
  };

  const reorderTracks = (startIndex: number, endIndex: number) => {
    const result = Array.from(setTracks);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    setSetTracks(result);
  };

  const handleTransitionAnalysis = async (trackAId: string, trackBId: string): Promise<TransitionAnalysis | null> => {
    const trackA = setTracks.find(t => t.id === trackAId);
    const trackB = setTracks.find(t => t.id === trackBId);
    if (trackA && trackB) {
      return await analyzeTransitionAi(trackA, trackB);
    }
    return null;
  };

  const handleAiSuggest = async () => {
      if (setTracks.length === 0) return;
      setIsAiSuggesting(true);
      setAiSuggestions([]); // Clear previous
      
      try {
          const suggestions = await getAiSuggestions(setTracks, library, setType);
          setAiSuggestions(suggestions);
      } catch (e) {
          console.error("AI Suggest Error", e);
      } finally {
          setIsAiSuggesting(false);
      }
  };

  const saveSet = async () => {
    const setList: SetList = {
        id: crypto.randomUUID(),
        name: `Set ${new Date().toLocaleDateString()}`,
        tracks: setTracks,
        type: setType,
        totalDuration: estimatedTotalTime // Save the SMART duration
    };
    await trackService.saveSetList(setList);
    alert(`Set (${setType} 模式) 已保存!`);
  };

  const handleSort = (key: SortKey) => {
      setSortCriteria(prev => {
          const existingIndex = prev.findIndex(c => c.key === key);
          if (sortMode === 'single') {
              if (existingIndex >= 0) {
                  return [{ key, order: prev[existingIndex].order === 'asc' ? 'desc' : 'asc' }];
              } else {
                  return [{ key, order: 'asc' }];
              }
          } else {
              if (existingIndex >= 0) {
                  const newCriteria = [...prev];
                  newCriteria[existingIndex] = { 
                      ...newCriteria[existingIndex], 
                      order: newCriteria[existingIndex].order === 'asc' ? 'desc' : 'asc' 
                  };
                  return newCriteria;
              } else {
                  return [...prev, { key, order: 'asc' }];
              }
          }
      });
  };

  const clearSort = () => {
      setSortCriteria([]);
  };

  const toggleSortMode = () => {
      setSortMode(prev => {
          const newMode = prev === 'single' ? 'multi' : 'single';
          if (newMode === 'single' && sortCriteria.length > 1) {
              setSortCriteria([sortCriteria[0]]);
          }
          return newMode;
      });
  };
  
  const handleSetGenreClick = (genre: string) => {
    if (!genre) {
        setSelectedCategory(null);
    } else {
        const cat = getGenreCategory(genre);
        setSelectedCategory(cat);
    }
  };

  const processedLibrary = useMemo(() => {
    let result = [...library];
    if (selectedCategory) {
        result = result.filter(t => getGenreCategory(t.genre) === selectedCategory);
    }
    if (searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        result = result.filter(t => 
            t.title.toLowerCase().includes(lowerTerm) || 
            t.artist.toLowerCase().includes(lowerTerm)
        );
    }
    if (isFocusMode) {
        if (setType === 'warmup') result = result.filter(t => t.resonance <= 7);
        else if (setType === 'prime') result = result.filter(t => t.resonance >= 6);
        else if (setType === 'closing') result = result.filter(t => t.resonance >= 7);
    }
    if (sortCriteria.length > 0) {
        const parseKey = (k: string) => {
             if (!k) return 0;
             const match = k.match(/(\d+)([AB])/);
             if (!match) return 0;
             return parseInt(match[1]) * 10 + (match[2] === 'A' ? 0 : 5);
        };
        result.sort((a, b) => {
            for (const criterion of sortCriteria) {
                let valA: any = a[criterion.key];
                let valB: any = b[criterion.key];
                if (criterion.key === 'key') {
                    valA = parseKey(String(a.key));
                    valB = parseKey(String(b.key));
                }
                if (valA < valB) return criterion.order === 'asc' ? -1 : 1;
                if (valA > valB) return criterion.order === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }
    return result;
  }, [library, searchTerm, sortCriteria, selectedCategory, isFocusMode, setType]);

  const focusModeDescription = useMemo(() => {
      if (!isFocusMode) return "开启专注模式以过滤不适合当前时段的歌曲";
      if (setType === 'warmup') return "暖场模式: 已隐藏高共鸣金曲 (>7)";
      if (setType === 'prime') return "黄金模式: 已隐藏低共鸣铺垫曲 (<6)";
      if (setType === 'closing') return "收尾模式: 已隐藏非经典曲目 (<7)";
      return "";
  }, [isFocusMode, setType]);

  if (isLoading) {
      return <div className="h-screen w-full flex items-center justify-center bg-dj-dark text-dj-accent animate-pulse">正在初始化 SpinFlow...</div>
  }

  return (
    <div className="h-screen w-full bg-dj-dark flex text-slate-200 overflow-hidden font-sans">
      
      {/* LEFT: Library Panel */}
      <div className="w-1/3 min-w-[350px] max-w-md border-r border-slate-800 flex flex-col bg-slate-900/50">
        <div className="p-4 border-b border-slate-800 bg-slate-900 z-10 flex flex-col gap-3">
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-dj-accent shadow-[0_0_10px_#06b6d4]"></div>
            SPIN<span className="text-dj-accent">FLOW</span>
          </h1>
          
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input 
              type="text"
              placeholder="搜索曲库..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-sm rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-dj-accent focus:ring-1 focus:ring-dj-accent transition-all text-white placeholder-slate-500"
            />
          </div>

          {/* FOCUS MODE TOGGLE */}
          <button
            onClick={() => setIsFocusMode(!isFocusMode)}
            className={`w-full py-2 px-3 rounded-lg flex items-center justify-between text-xs font-bold transition-all border ${
                isFocusMode 
                ? 'bg-dj-accent/10 border-dj-accent text-dj-accent shadow-[0_0_10px_rgba(6,182,212,0.1)]' 
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
             <div className="flex items-center gap-2">
                 <Target className="w-4 h-4" />
                 <span>专注选曲 (Smart Focus)</span>
             </div>
             {isFocusMode && (
                 <span className="bg-dj-accent text-slate-900 px-1.5 py-0.5 rounded text-[10px]">ON</span>
             )}
          </button>
          
          {isFocusMode && (
              <div className="bg-slate-800/50 border border-slate-700 rounded px-2 py-1.5 flex items-center gap-2 text-[10px] text-slate-400 animate-in fade-in slide-in-from-top-1">
                  <Filter className="w-3 h-3 text-slate-500" />
                  {focusModeDescription}
              </div>
          )}

          {/* Genre Category Filter Bar */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
            <button 
                onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                    selectedCategory === null 
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' 
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
            >
                全部
            </button>
            {allCategories.map(cat => (
                <button 
                    key={cat}
                    onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                        selectedCategory === cat 
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' 
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
                    }`}
                >
                    {cat}
                </button>
            ))}
          </div>

          {/* Sort Controls */}
          <div className="space-y-2 pt-1 border-t border-slate-800/50">
              <div className="flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                      <span className="font-medium">排序模式:</span>
                      <div className="flex bg-slate-800 rounded p-0.5 border border-slate-700">
                          <button 
                            onClick={() => sortMode !== 'single' && toggleSortMode()}
                            className={`px-2 py-0.5 rounded text-[10px] transition-all ${sortMode === 'single' ? 'bg-slate-600 text-white shadow-sm' : 'hover:text-slate-300'}`}
                          >
                              单项
                          </button>
                          <button 
                            onClick={() => sortMode !== 'multi' && toggleSortMode()}
                            className={`px-2 py-0.5 rounded text-[10px] transition-all ${sortMode === 'multi' ? 'bg-dj-accent text-slate-900 font-bold shadow-sm' : 'hover:text-slate-300'}`}
                          >
                              多项
                          </button>
                      </div>
                  </div>
                  
                  {sortCriteria.length > 0 && (
                      <button onClick={clearSort} className="text-[10px] flex items-center gap-1 hover:text-white transition-colors">
                          <X className="w-3 h-3" /> 重置
                      </button>
                  )}
              </div>

              <div className="flex gap-1 flex-wrap">
                  {[
                      { id: 'bpm', label: 'BPM', icon: <Activity className="w-3 h-3" /> },
                      { id: 'key', label: '调性', icon: <Music className="w-3 h-3" /> },
                      { id: 'energy', label: '能量', icon: <Zap className="w-3 h-3" /> },
                      { id: 'resonance', label: '共鸣', icon: <Flame className="w-3 h-3" /> }
                  ].map((opt) => {
                      const activeIndex = sortCriteria.findIndex(c => c.key === opt.id);
                      const isActive = activeIndex >= 0;
                      const activeSort = isActive ? sortCriteria[activeIndex] : null;

                      return (
                          <button
                            key={opt.id}
                            onClick={() => handleSort(opt.id as SortKey)}
                            className={`px-2 py-1.5 rounded flex items-center gap-1.5 transition-all text-xs border border-transparent ${
                                isActive 
                                ? 'bg-slate-700 text-white border-slate-600 shadow-sm' 
                                : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                          >
                              {opt.icon} 
                              <span>{opt.label}</span>
                              
                              {isActive && activeSort && (
                                  <span className="flex items-center ml-0.5">
                                      {sortMode === 'multi' && (
                                          <span className="bg-slate-900 text-slate-300 text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center mr-1 font-mono">
                                              {activeIndex + 1}
                                          </span>
                                      )}
                                      {activeSort.order === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                                  </span>
                              )}
                          </button>
                      );
                  })}
              </div>
          </div>
        </div>

        {/* Track List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <div className="text-xs font-semibold text-slate-500 uppercase px-2 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2">
                    <Library className="w-3 h-3" /> 
                    曲库 ({processedLibrary.length})
                    {selectedCategory && <span className="text-indigo-400 normal-case ml-1 flex items-center gap-1"><Disc className="w-3 h-3"/> {selectedCategory}</span>}
                </span>
            </div>
            
            {processedLibrary.length === 0 && (
                <div className="p-8 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
                    <Filter className="w-8 h-8 opacity-20" />
                    <p>未找到匹配歌曲</p>
                    {isFocusMode && <p className="text-xs text-slate-600">专注模式已过滤部分歌曲</p>}
                </div>
            )}

            {processedLibrary.map(track => {
                const trackCategory = getGenreCategory(track.genre);
                const isCatActive = selectedCategory === trackCategory;

                return (
                    <div 
                        key={track.id} 
                        className="p-2 rounded-md flex items-center justify-between group border border-transparent transition-all hover:bg-slate-800 hover:border-slate-700"
                    >
                        <div className="flex items-center gap-3 overflow-hidden flex-1">
                            <img src={track.coverUrl || 'https://via.placeholder.com/40'} className="w-11 h-11 rounded object-cover opacity-80 group-hover:opacity-100 bg-slate-800" />
                            <div className="min-w-0 flex-1">
                                <div className="font-medium text-sm text-slate-200 truncate flex items-center gap-2">
                                    {track.title}
                                </div>
                                <div className="text-xs text-slate-500 truncate">{track.artist}</div>
                                
                                {/* Metrics Row */}
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    <span 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedCategory(isCatActive ? null : trackCategory);
                                        }}
                                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border cursor-pointer transition-colors ${
                                            isCatActive 
                                            ? 'bg-indigo-600 text-white border-indigo-500' 
                                            : 'bg-slate-700/50 text-slate-400 border-slate-700 hover:bg-slate-600 hover:text-slate-200'
                                        }`} 
                                        title={`筛选所有 ${trackCategory} 风格`}
                                    >
                                        <Tag className="w-2.5 h-2.5" /> {track.genre}
                                    </span>

                                    <span className="flex items-center gap-1 bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px] text-slate-300 font-mono">
                                        <Activity className="w-3 h-3 text-dj-accent" /> {track.bpm}
                                    </span>
                                    <span className="flex items-center gap-1 bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px] text-slate-300 font-mono">
                                        <Music className="w-3 h-3 text-dj-primary" /> {track.key}
                                    </span>
                                    <span className="flex items-center gap-1 bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px] text-slate-300 font-mono" title="能量">
                                        <Zap className="w-3 h-3 text-yellow-500" /> {track.energy}
                                    </span>
                                    <span className="flex items-center gap-1 bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px] text-slate-300 font-mono" title="共鸣">
                                        <Flame className={`w-3 h-3 ${track.resonance > 7 ? 'text-orange-500' : 'text-slate-500'}`} /> {track.resonance}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={() => addToSet(track)}
                            className="p-1.5 rounded-full bg-slate-700 text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-dj-accent hover:text-white transition-all transform hover:scale-105"
                            title="添加到 Set"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                )
            })}
        </div>
      </div>

      {/* MIDDLE: Set Builder */}
      <div className="flex-1 flex flex-col bg-gradient-to-br from-dj-dark to-[#131c31] relative">
        <div className="px-6 pt-4 pb-0 flex items-center justify-between">
            <div className="flex bg-slate-900/80 p-1 rounded-lg border border-slate-700/50">
                <button
                    onClick={() => setSetType('warmup')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                        setType === 'warmup' 
                        ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                >
                    <Sunrise className="w-4 h-4" /> 暖场 (Warm-up)
                </button>
                <button
                    onClick={() => setSetType('prime')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                        setType === 'prime' 
                        ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-lg' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                >
                    <Sun className="w-4 h-4" /> 黄金时段 (Prime)
                </button>
                <button
                    onClick={() => setSetType('closing')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                        setType === 'closing' 
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                >
                    <Sunset className="w-4 h-4" /> 收尾 (Closing)
                </button>
            </div>
            
            <div className="text-xs text-slate-500 hidden xl:block">
                {setType === 'warmup' && "策略: 控制能量，避免过早消耗金曲"}
                {setType === 'prime' && "策略: 高能量输出，保持舞池热度"}
                {setType === 'closing' && "策略: 情感共鸣，回归经典"}
            </div>
        </div>

        <div className="flex-1 p-6 overflow-hidden flex flex-col">
            <SetBuilder 
                setTracks={setTracks}
                onRemoveTrack={removeFromSet}
                onReorderTracks={reorderTracks}
                onAnalyzeTransition={handleTransitionAnalysis}
                setType={setType}
                onGenreClick={handleSetGenreClick}
                highlightedCategory={selectedCategory}
            />
        </div>
        
        {/* Set Action Footer in Middle Column */}
        <div className="p-4 border-t border-slate-800/50 bg-slate-900/50 flex gap-3">
             <button 
                onClick={() => setSetTracks([])}
                className="flex-1 py-3 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center gap-2 text-sm transition-colors"
            >
                <RotateCcw className="w-4 h-4" /> 重置
            </button>
            <button 
                onClick={saveSet}
                disabled={setTracks.length === 0}
                className="flex-1 py-3 rounded-lg bg-dj-success hover:bg-emerald-400 text-slate-900 font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Save className="w-4 h-4" /> 保存 Setlist
            </button>
        </div>
      </div>

      {/* RIGHT: Analysis & AI Panel (Vertical Split - WIDENED to 600px) */}
      <div className="w-[600px] border-l border-slate-800 bg-slate-900/30 flex flex-col">
        
        {/* TOP HALF: ANALYSIS & DATA */}
        <div className="flex flex-col border-b border-slate-800 shadow-xl z-10 max-h-[55%] min-h-[40%] resize-y overflow-hidden relative">
             <div className="bg-slate-900/80 px-4 py-3 flex items-center gap-2 border-b border-slate-800/50 backdrop-blur-sm sticky top-0 z-20">
                 <BarChart3 className="w-4 h-4 text-dj-accent" />
                 <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">实时诊断 & 数据</h3>
             </div>

             <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-900/20">
                {/* DIAGNOSTICS MODULE */}
                <div className="bg-slate-900/80 rounded-lg border border-slate-700/50 p-3">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span>诊断报告</span>
                        {issueCount === 0 ? (
                            <span className="text-emerald-500 flex items-center gap-1 text-[9px] bg-emerald-900/20 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                                <CheckCircle2 className="w-2.5 h-2.5" /> 健康
                            </span>
                        ) : (
                            <span className="text-amber-500 flex items-center gap-1 text-[9px] bg-amber-900/20 px-1.5 py-0.5 rounded-full border border-amber-500/20 animate-pulse">
                                <AlertTriangle className="w-2.5 h-2.5" /> {issueCount} 异常
                            </span>
                        )}
                    </h3>
                    
                    {issueCount === 0 && (
                        <div className="text-[10px] text-slate-600 italic text-center py-1">
                            Set 编排流畅
                        </div>
                    )}

                    <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                        {globalIssues
                            .filter(i => i.severity === 'critical' || i.severity === 'warning')
                            .map((issue, idx) => {
                                const trackIndex = parseInt(issue.id.split('-').pop() || '0') + 1;
                                return (
                                    <div key={idx} className={`text-[10px] p-1.5 rounded border flex items-start gap-2 ${
                                        issue.severity === 'critical' 
                                        ? 'bg-red-900/20 border-red-500/30 text-red-300' 
                                        : 'bg-amber-900/20 border-amber-500/30 text-amber-300'
                                    }`}>
                                        <span className="font-mono font-bold opacity-70 mt-px">#{trackIndex}</span>
                                        <div className="flex-1 leading-tight">
                                            {issue.message}
                                        </div>
                                    </div>
                                );
                        })}
                    </div>
                </div>

                {/* Compact Stats */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-dj-panel p-2 rounded border border-slate-700">
                        <div className="text-slate-500 text-[9px]">预计总时长</div>
                        <div className="text-sm font-mono text-white text-emerald-400">
                            {estimatedTotalTime}
                        </div>
                    </div>
                    <div className="bg-dj-panel p-2 rounded border border-slate-700">
                        <div className="text-slate-500 text-[9px]">歌曲数</div>
                        <div className="text-sm font-mono text-white">{setTracks.length}</div>
                    </div>
                    <div className="bg-dj-panel p-2 rounded border border-slate-700">
                        <div className="text-slate-500 text-[9px]">平均能量</div>
                        <div className="text-sm font-mono text-white flex items-center gap-1">
                            <Zap className="w-3 h-3 text-yellow-500" />
                            {averageEnergy}
                        </div>
                    </div>
                    <div className="bg-dj-panel p-2 rounded border border-slate-700 overflow-hidden">
                        <div className="text-slate-500 text-[9px]">主导风格</div>
                        <div className="text-xs font-medium text-white truncate">
                            {genreStats.length > 0 ? genreStats[0].name.split('/')[0] : '-'}
                        </div>
                    </div>
                </div>
                
                <EnergyChart tracks={setTracks} />
             </div>
        </div>

        {/* BOTTOM HALF: AI SUGGESTIONS */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-950/30">
             <div className="bg-slate-900/90 px-4 py-3 flex items-center justify-between border-b border-slate-800/50 backdrop-blur-sm shrink-0">
                 <div className="flex items-center gap-2">
                     <Sparkles className="w-4 h-4 text-indigo-400" />
                     <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">AI 选曲助手</h3>
                 </div>
                 {isAiSuggesting && <Loader2 className="w-3 h-3 animate-spin text-indigo-500"/>}
             </div>

             <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative">
                 <div className="mb-3">
                    <button 
                        onClick={handleAiSuggest} 
                        disabled={isAiSuggesting}
                        className="w-full py-2.5 px-4 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/40 hover:text-white hover:border-indigo-400 transition-all text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                    >
                       {isAiSuggesting ? <Loader2 className="w-3 h-3 animate-spin"/> : <ScanEye className="w-3 h-3" />}
                       {isAiSuggesting ? '正在分析...' : '寻找下一首最佳衔接'}
                    </button>
                    {setTracks.length === 0 && (
                        <p className="text-[10px] text-slate-600 text-center mt-2">添加歌曲后，AI 将基于最后一首进行推荐</p>
                    )}
                 </div>

                 <div className="space-y-2 pb-2">
                    {aiSuggestions.map((s, idx) => {
                       const track = library.find(t => t.id === s.trackId);
                       if (!track) return null;
                       
                       return (
                           <div key={`${s.trackId}-${idx}`} className="bg-slate-800/80 border border-slate-700/80 p-2.5 rounded hover:border-indigo-500/50 transition-all group relative animate-in fade-in slide-in-from-bottom-2 duration-300">
                               
                               <div className="flex gap-2.5">
                                    <img src={track.coverUrl || ''} className="w-12 h-12 rounded object-cover shadow-sm bg-slate-900 shrink-0" />
                                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                                        <div className="flex justify-between items-start">
                                            <h4 className="font-bold text-xs text-slate-200 truncate pr-1">{track.title}</h4>
                                            {s.score && <span className="text-[9px] font-bold text-green-400 bg-green-950/40 px-1 rounded">{s.score}%</span>}
                                        </div>
                                        <p className="text-[10px] text-slate-400 truncate">{track.artist}</p>
                                        
                                        {/* Updated Metrics Badges with Resonance */}
                                        <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
                                            <span className="text-[9px] text-slate-500 font-mono flex items-center gap-0.5 bg-slate-900/50 px-1 rounded">
                                                <Activity className="w-2.5 h-2.5" /> {track.bpm}
                                            </span>
                                            <span className="text-[9px] text-slate-500 font-mono flex items-center gap-0.5 bg-slate-900/50 px-1 rounded">
                                                <Music className="w-2.5 h-2.5" /> {track.key}
                                            </span>
                                            <span className="text-[9px] text-yellow-500/80 font-mono flex items-center gap-0.5 bg-yellow-900/10 px-1 rounded">
                                                <Zap className="w-2.5 h-2.5" /> {track.energy}
                                            </span>
                                            <span className="text-[9px] text-orange-500/80 font-mono flex items-center gap-0.5 bg-orange-900/10 px-1 rounded" title="共鸣度">
                                                <Flame className="w-2.5 h-2.5" /> {track.resonance}
                                            </span>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => addToSet(track)}
                                        className="self-center p-1.5 bg-slate-700 hover:bg-indigo-600 text-slate-300 hover:text-white rounded shadow-sm transition-colors"
                                    >
                                       <Plus className="w-3.5 h-3.5" />
                                   </button>
                               </div>

                               <div className="mt-2 text-[10px] text-indigo-300 bg-indigo-900/20 p-1.5 rounded border border-indigo-500/10 leading-snug flex gap-1.5 items-start">
                                    <Bot className="w-3 h-3 mt-0.5 text-indigo-400 shrink-0" />
                                    <span className="opacity-90">{s.reasoning}</span>
                               </div>
                           </div>
                       );
                    })}
                    
                    {aiSuggestions.length === 0 && !isAiSuggesting && setTracks.length > 0 && (
                        <div className="text-center py-6 opacity-30">
                            <Sparkles className="w-8 h-8 mx-auto mb-1" />
                            <p className="text-[10px]">点击上方按钮获取 AI 推荐</p>
                        </div>
                    )}
                 </div>
            </div>
        </div>

      </div>

    </div>
  );
};

export default App;