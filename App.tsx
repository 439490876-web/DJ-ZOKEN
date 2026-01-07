import React, { useState, useEffect, useMemo } from 'react';
import { Track, SetList, TransitionAnalysis, SetType } from './types';
import { trackService } from './services/trackService';
import { analyzeTransitionAi } from './services/geminiService';
import EnergyChart from './components/EnergyChart';
import SetBuilder from './components/SetBuilder';
import { Search, Library, Plus, Save, RotateCcw, Sunrise, Sun, Sunset, ArrowUp, ArrowDown, Zap, Flame, Activity, Music, X, Tag, Disc } from 'lucide-react';

type SortKey = 'bpm' | 'key' | 'energy' | 'resonance';
interface SortCriterion {
    key: SortKey;
    order: 'asc' | 'desc';
}

// ---------------------------
// Genre Grouping Logic
// ---------------------------
const getGenreCategory = (genre: string = ''): string => {
    const g = (genre || '').toLowerCase();
    if (!g) return 'Other';
    
    if (g.includes('house') || g.includes('minimal') || g.includes('acid') || g === 'progressive' || g.includes('disco')) return 'House / Disco';
    if (g.includes('techno')) return 'Techno';
    if (g.includes('trance') || g.includes('psytrance')) return 'Trance';
    if (g.includes('hip hop') || g.includes('rap') || g.includes('trap') || g.includes('r&b') || g.includes('afrobeat') || g.includes('dancehall')) return 'Hip Hop / R&B';
    if (g.includes('dnb') || g.includes('drum & bass') || g.includes('dubstep') || g.includes('bass') || g.includes('ukg') || g.includes('garage')) return 'Bass / DnB';
    if (g.includes('latin') || g.includes('reggaeton') || g.includes('moombahton')) return 'Latin';
    if (g.includes('rock') || g.includes('grunge') || g.includes('metal') || g.includes('punk') || g.includes('indie')) return 'Rock / Alt';
    if (g.includes('jazz') || g.includes('lo-fi') || g.includes('ambient') || g.includes('lounge') || g.includes('trip hop') || g.includes('downtempo')) return 'Chill / Jazz';
    if (g.includes('big room') || g.includes('hardstyle') || g.includes('hardcore') || g.includes('festival')) return 'Hard / Festival';
    if (g.includes('pop') || g.includes('k-pop') || g.includes('dance')) return 'Pop / Dance';
    if (g.includes('tool') || g.includes('fx') || g.includes('sample') || g.includes('loop') || g.includes('acapella')) return 'Tools';
    
    return 'Other';
};

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

  const addToSet = (track: Track) => {
    const newTrack = { ...track, id: `${track.id}-${crypto.randomUUID()}` }; 
    setSetTracks([...setTracks, newTrack]);
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

  const saveSet = async () => {
    const setList: SetList = {
        id: crypto.randomUUID(),
        name: `Set ${new Date().toLocaleDateString()}`,
        tracks: setTracks,
        type: setType,
        totalDuration: '00:00'
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

  // ---------------------------
  // Filter & Sort Execution
  // ---------------------------
  const processedLibrary = useMemo(() => {
    let result = [...library];

    // 1. Genre Category Filter
    if (selectedCategory) {
        result = result.filter(t => getGenreCategory(t.genre) === selectedCategory);
    }

    // 2. Search Filter
    if (searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        result = result.filter(t => 
            t.title.toLowerCase().includes(lowerTerm) || 
            t.artist.toLowerCase().includes(lowerTerm)
        );
    }

    // 3. Sort
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
  }, [library, searchTerm, sortCriteria, selectedCategory]);


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
                <div className="p-8 text-center text-slate-500 text-sm">
                    未找到匹配歌曲
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
                                    {/* Specific Genre Badge (Clicking it selects the PARENT category) */}
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
        {/* Context Selector Bar */}
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
            />
        </div>
      </div>

      {/* RIGHT: Analysis Panel */}
      <div className="w-80 border-l border-slate-800 bg-slate-900/30 p-4 flex flex-col gap-6">
        <div>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Set 数据分析</h3>
            <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-dj-panel p-3 rounded-lg border border-slate-700">
                    <div className="text-slate-500 text-xs">总时长</div>
                    <div className="text-xl font-mono text-white">
                        {Math.floor(setTracks.reduce((acc, t) => acc + (t.duration ? parseInt(t.duration.split(':')[0]) * 60 + parseInt(t.duration.split(':')[1]) : 0), 0) / 60)}m
                    </div>
                </div>
                <div className="bg-dj-panel p-3 rounded-lg border border-slate-700">
                    <div className="text-slate-500 text-xs">歌曲数量</div>
                    <div className="text-xl font-mono text-white">{setTracks.length}</div>
                </div>
            </div>
            
            <EnergyChart tracks={setTracks} />
        </div>

        <div className="mt-auto space-y-3">
            <button 
                onClick={() => setSetTracks([])}
                className="w-full py-2 px-4 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center gap-2 text-sm transition-colors"
            >
                <RotateCcw className="w-4 h-4" /> 重置
            </button>
            <button 
                onClick={saveSet}
                disabled={setTracks.length === 0}
                className="w-full py-3 px-4 rounded-lg bg-dj-success hover:bg-emerald-400 text-slate-900 font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Save className="w-4 h-4" /> 保存 Setlist
            </button>
        </div>
      </div>

    </div>
  );
};

export default App;