import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Track } from '../types';
import { ZoomIn, MoveHorizontal, RotateCcw, ChevronLeft, ChevronRight, Flame } from 'lucide-react';

interface EnergyChartProps {
  tracks: Track[];
}

/**
 * EnergyChart Component / 能量趋势图表组件
 * 
 * Visualizes the energy flow of the DJ set.
 * Key Feature: The line color changes dynamically based on the "Resonance" metric.
 * 可视化 DJ Set 的能量流向。
 * 核心特性：线条颜色会根据“共鸣度”指标动态变化。
 */
const EnergyChart: React.FC<EnergyChartProps> = ({ tracks }) => {
  // --- Viewport State Management (视窗状态管理) ---
  const [windowStart, setWindowStart] = useState(0); // Start index of current view / 当前视图起始索引
  const [windowSize, setWindowSize] = useState(tracks.length); // Number of tracks shown (Zoom Level) / 当前显示的歌曲数量
  
  // --- Drag Interaction State (拖拽交互状态) ---
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartWindow, setDragStartWindow] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset view when the track list changes drastically
  // 当歌曲列表发生剧烈变化时重置视图
  useEffect(() => {
    resetView();
  }, [tracks.length]);

  const resetView = () => {
      setWindowStart(0);
      setWindowSize(Math.max(tracks.length, 4));
  };

  // --- Data Formatting (数据格式化) ---
  // Map raw track data to chart-friendly format
  // 将原始歌曲数据映射为图表友好格式
  const data = tracks.map((track, index) => ({
    originalIndex: index + 1,
    name: index + 1,
    title: track.title,
    energy: track.energy,
    bpm: track.bpm,
    resonance: track.resonance, // Used for coloring / 用于着色
    heatStatus: track.heatStatus
  }));

  // Slice data for current zoom level / 截取当前缩放级别的数据
  const visibleData = data.slice(windowStart, windowStart + windowSize);

  // --- Interaction Logic: Wheel Zoom (交互逻辑：滚轮缩放) ---
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation(); 
    
    if (tracks.length <= 4) return;

    const zoomIntensity = 0.15; // Zoom speed 15% / 缩放速度
    const direction = Math.sign(e.deltaY); // +1 = Zoom Out, -1 = Zoom In
    
    let sizeDelta = windowSize * zoomIntensity * direction;
    if (Math.abs(sizeDelta) < 0.5) sizeDelta = 0.5 * direction; // Min step / 最小步进

    let newSize = windowSize + sizeDelta;

    // Boundary constraints / 边界限制
    const minSize = 4; 
    const maxSize = tracks.length;
    
    if (newSize < minSize) newSize = minSize;
    if (newSize > maxSize) newSize = maxSize;

    // Center-based zooming / 基于中心缩放
    const currentCenter = windowStart + windowSize / 2;
    const newStart = currentCenter - newSize / 2;

    updateWindow(newStart, newSize);
  };

  // Update window with boundary checks / 更新视窗并检查边界
  const updateWindow = (start: number, size: number) => {
    let checkedStart = start;
    if (checkedStart < 0) checkedStart = 0;
    if (checkedStart + size > tracks.length) checkedStart = tracks.length - size;
    
    setWindowSize(size);
    setWindowStart(checkedStart);
  };

  // --- Interaction Logic: Dragging (交互逻辑：拖拽平移) ---
  const handleMouseDown = (e: React.MouseEvent) => {
      if (windowSize >= tracks.length - 0.1) return; // No need to pan if fully zoomed out / 未缩放时无需平移
      setIsDragging(true);
      setDragStartX(e.clientX);
      setDragStartWindow(windowStart);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDragging) return;
      
      const diff = dragStartX - e.clientX;
      // Calculate scroll ratio / 计算滚动比例
      const containerWidth = containerRef.current?.clientWidth || 1;
      const ratio = windowSize / containerWidth; 
      const indexShift = diff * ratio;

      updateWindow(dragStartWindow + indexShift, windowSize);
  };

  const handleMouseUp = () => {
      setIsDragging(false);
  };

  // --- Interaction Logic: Button Slide (交互逻辑：按钮滑动) ---
  const slideView = (direction: 'left' | 'right', e: React.MouseEvent) => {
      e.stopPropagation();
      const step = Math.max(1, Math.floor(windowSize / 4));
      const newStart = direction === 'left' ? windowStart - step : windowStart + step;
      updateWindow(newStart, windowSize);
  };

  // Empty state / 空状态
  if (tracks.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center border border-dashed border-slate-700 rounded-lg text-slate-500 text-xs bg-slate-900/50">
        Add tracks to view Energy Flow (添加歌曲以查看能量流向)
      </div>
    );
  }

  // Calculate UI states / 计算 UI 状态
  const isZoomed = windowSize < tracks.length - 0.5;
  const canScrollLeft = isZoomed && windowStart > 0.5;
  const canScrollRight = isZoomed && (windowStart + windowSize) < tracks.length - 0.5;

  return (
    <div 
        className="h-52 w-full bg-dj-panel rounded-lg p-2 shadow-sm border border-slate-700 flex flex-col relative overflow-hidden group select-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        ref={containerRef}
        style={{ cursor: isZoomed ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
    >
      {/* --- Header & Legend (头部与图例) --- */}
      <div className="flex justify-between items-center mb-1 px-1 pointer-events-none z-10">
        <div className="flex items-center gap-2">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                Set Energy Flow (能量流向)
                {isZoomed && <span className="text-[9px] font-normal text-slate-500">({Math.round(windowSize)} / {tracks.length})</span>}
            </h3>
            {/* Bilingual helper text / 双语辅助说明 */}
            <span className="text-[9px] text-slate-500/80 font-normal hidden md:inline-block border-l border-slate-700/50 pl-2">
               Curve: Energy / Color: Resonance (曲线:能量 / 颜色:共鸣)
            </span>
        </div>
        
        {/* --- Resonance Legend (共鸣度图例) --- */}
        <div className="hidden sm:flex items-center gap-2 text-[9px] text-slate-500 bg-slate-900/50 px-2 py-0.5 rounded-full border border-slate-700/30">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400"></span>Anthem (10)</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>Hit (8-9)</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>Pop (6-7)</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>Std (4-5)</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>Deep (1-3)</span>
        </div>
        
        {/* Controls / 控制按钮 */}
        <div className="flex items-center gap-2">
            {isZoomed ? (
                <div className="flex gap-2 pointer-events-auto animate-in fade-in">
                    <span className="text-[9px] text-dj-accent bg-dj-accent/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <MoveHorizontal className="w-2.5 h-2.5" /> Pan/Scroll
                    </span>
                    <button 
                        onClick={(e) => { e.stopPropagation(); resetView(); }}
                        className="text-[9px] text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 px-1.5 py-0.5 rounded flex items-center gap-1 border border-slate-600 transition-colors"
                    >
                        <RotateCcw className="w-2.5 h-2.5" /> Reset
                    </button>
                </div>
            ) : (
                tracks.length > 4 && (
                    <span className="text-[9px] text-slate-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ZoomIn className="w-2.5 h-2.5" /> Wheel to Zoom
                    </span>
                )
            )}
        </div>
      </div>

      <div className="flex-1 min-h-0 pointer-events-none relative z-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={visibleData}
            margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              {/* 
                  Gradient Definition (渐变定义): 
                  Changes color horizontally based on each track's resonance value.
                  根据每首歌的共鸣度水平改变颜色。
              */}
              <linearGradient id="colorResonance" x1="0" y1="0" x2="1" y2="0">
                {visibleData.map((entry, index) => {
                    const offset = visibleData.length > 1 
                        ? (index / (visibleData.length - 1)) * 100 
                        : 0;
                    
                    // --- Color Mapping Logic (颜色映射逻辑) ---
                    const heatReady = entry.heatStatus === 'ok' && typeof entry.resonance === 'number';
                    let color = '#64748b'; // Default neutral when heat not ready
                    if (heatReady) {
                        if (entry.resonance >= 10) color = '#c084fc'; // 10: Fuchsia/Purple (炸场/Anthem)
                        else if (entry.resonance >= 8) color = '#f43f5e'; // 8-9: Rose (热门/Hit)
                        else if (entry.resonance >= 6) color = '#fbbf24'; // 6-7: Amber (流行/Popular)
                        else if (entry.resonance <= 3) color = '#64748b'; // 1-3: Slate (冷门/Deep)
                        else color = '#22d3ee'; // 4-5: Cyan (常规/Standard)
                    }
                    
                    return <stop key={index} offset={`${offset}%`} stopColor={color} />;
                })}
              </linearGradient>

              {/* Vertical Opacity Mask (垂直透明度遮罩) */}
              <linearGradient id="opacityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="white" stopOpacity={0.7}/>
                <stop offset="95%" stopColor="white" stopOpacity={0.05}/>
              </linearGradient>
              <mask id="fadeMask">
                  <rect x="0" y="0" width="100%" height="100%" fill="url(#opacityGradient)" />
              </mask>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis 
                dataKey="originalIndex" 
                stroke="#64748b" 
                tick={{fontSize: 9}} 
                type="number" 
                domain={['dataMin', 'dataMax']}
                interval={0}
                allowDecimals={false}
                tickCount={Math.min(visibleData.length, 10)}
            />
            <YAxis stroke="#64748b" domain={[0, 12]} hide />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9', fontSize: '10px' }}
              itemStyle={{ color: '#06b6d4' }}
              labelStyle={{ display: 'none' }}
              formatter={(value: number, name: string, props: any) => {
                  const heatReady = props.payload.heatStatus === 'ok' && typeof props.payload.resonance === 'number';
                  const resonanceValue = heatReady ? props.payload.resonance : null;
                  const resonanceLabel = heatReady ? `${resonanceValue}/10` : (props.payload.heatStatus === 'pending' ? '正在解析' : '—');
                  const resonanceClass = heatReady
                    ? (resonanceValue >= 10 ? 'text-fuchsia-400 font-bold' :
                      resonanceValue >= 8 ? 'text-rose-400 font-bold' : 
                      resonanceValue >= 6 ? 'text-amber-400' :
                      resonanceValue <= 3 ? 'text-slate-400' : 'text-cyan-400')
                    : 'text-slate-400';
                  return [
                    <div key="tooltip" className="flex flex-col gap-1">
                        <span>Energy: {value}/10</span>
                        {/* Dynamic color in tooltip / 工具提示中的动态颜色 */}
                        <span className={`flex items-center gap-1 ${resonanceClass}`}>
                            <Flame className="w-3 h-3" /> Resonance: {resonanceLabel}
                        </span>
                    </div>,
                    `#${props.payload.originalIndex} ${props.payload.title}`
                  ];
              }}
            />
            {/* The Main Area (主要区域) */}
            <Area 
              type="monotone" 
              dataKey="energy" 
              stroke="url(#colorResonance)" 
              strokeWidth={2}
              fill="url(#colorResonance)"
              mask="url(#fadeMask)"
              animationDuration={300}
              isAnimationActive={!isDragging} // Disable animation during drag for perf / 拖拽时禁用动画
            />
          </AreaChart>
        </ResponsiveContainer>
        
        {/* Navigation Arrows (导航箭头) */}
        {canScrollLeft && (
            <button 
                onClick={(e) => slideView('left', e)}
                className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-auto p-1.5 rounded-r-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white backdrop-blur-sm border-y border-r border-slate-700/50 shadow-lg transition-all opacity-0 group-hover:opacity-100 z-20"
            >
                <ChevronLeft className="w-4 h-4" />
            </button>
        )}
        
        {canScrollRight && (
            <button 
                onClick={(e) => slideView('right', e)}
                className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-auto p-1.5 rounded-l-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white backdrop-blur-sm border-y border-l border-slate-700/50 shadow-lg transition-all opacity-0 group-hover:opacity-100 z-20"
            >
                <ChevronRight className="w-4 h-4" />
            </button>
        )}

      </div>
      
      {/* Scrollbar Indicator (滚动条指示器) */}
      {isZoomed && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800/50">
              <div 
                className="h-full bg-dj-accent/50 hover:bg-dj-accent rounded-full transition-all duration-75 cursor-grab"
                style={{
                    left: `${(windowStart / tracks.length) * 100}%`,
                    width: `${Math.max((windowSize / tracks.length) * 100, 5)}%`, // Min width / 最小宽度
                    position: 'absolute'
                }}
              />
          </div>
      )}
    </div>
  );
};

export default EnergyChart;
