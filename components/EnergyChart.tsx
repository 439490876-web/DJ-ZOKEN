import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Track } from '../types';
import { ZoomIn, MoveHorizontal, RotateCcw, Maximize2 } from 'lucide-react';

interface EnergyChartProps {
  tracks: Track[];
}

const EnergyChart: React.FC<EnergyChartProps> = ({ tracks }) => {
  // Viewport State
  const [windowStart, setWindowStart] = useState(0);
  const [windowSize, setWindowSize] = useState(tracks.length);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartWindow, setDragStartWindow] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset view when tracks change significantly (e.g. cleared set)
  useEffect(() => {
    resetView();
  }, [tracks.length]);

  const resetView = () => {
      setWindowStart(0);
      setWindowSize(Math.max(tracks.length, 4));
  };

  const data = tracks.map((track, index) => ({
    originalIndex: index + 1,
    name: index + 1,
    title: track.title,
    energy: track.energy,
    bpm: track.bpm
  }));

  // Calculate visible data
  const visibleData = data.slice(windowStart, windowStart + windowSize);

  // Wheel Zoom Logic
  const handleWheel = (e: React.WheelEvent) => {
    // Try to prevent page scroll if possible (might require passive: false listener in vanilla JS, 
    // but stopping propagation helps isolate the event)
    e.stopPropagation(); 
    
    if (tracks.length <= 4) return;

    // Use percentage based zoom for smoothness at different scales
    const zoomIntensity = 0.15; // 15% per tick
    const direction = Math.sign(e.deltaY); // +1 = Zoom Out (Wheel Down), -1 = Zoom In (Wheel Up)
    
    let sizeDelta = windowSize * zoomIntensity * direction;
    
    // Ensure we always move at least a bit when very zoomed in
    if (Math.abs(sizeDelta) < 0.5) sizeDelta = 0.5 * direction;

    let newSize = windowSize + sizeDelta;

    // Constraints
    const minSize = 4; // Allow zooming down to 4 tracks
    const maxSize = tracks.length;
    
    if (newSize < minSize) newSize = minSize;
    if (newSize > maxSize) newSize = maxSize;

    // Center zoom: Scale around the center of the current view
    const currentCenter = windowStart + windowSize / 2;
    const newStart = currentCenter - newSize / 2;

    updateWindow(newStart, newSize);
  };

  const updateWindow = (start: number, size: number) => {
    let checkedStart = start;
    
    // Boundary checks
    if (checkedStart < 0) checkedStart = 0;
    if (checkedStart + size > tracks.length) checkedStart = tracks.length - size;
    
    setWindowSize(size);
    setWindowStart(checkedStart);
  };

  // Drag to Pan Logic
  const handleMouseDown = (e: React.MouseEvent) => {
      if (windowSize >= tracks.length - 0.1) return; // Nothing to pan if fully zoomed out
      setIsDragging(true);
      setDragStartX(e.clientX);
      setDragStartWindow(windowStart);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDragging) return;
      
      const diff = dragStartX - e.clientX;
      // Dynamic sensitivity based on zoom level (drag feels consistent)
      const containerWidth = containerRef.current?.clientWidth || 1;
      const ratio = windowSize / containerWidth; 
      const indexShift = diff * ratio;

      updateWindow(dragStartWindow + indexShift, windowSize);
  };

  const handleMouseUp = () => {
      setIsDragging(false);
  };

  if (tracks.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center border border-dashed border-slate-700 rounded-lg text-slate-500 text-xs bg-slate-900/50">
        添加歌曲以查看能量流向
      </div>
    );
  }

  const isZoomed = windowSize < tracks.length - 0.5; // Tolerance for float math

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
      <div className="flex justify-between items-center mb-1 px-1 pointer-events-none z-10">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            Set 能量流向
            {isZoomed && <span className="text-[9px] font-normal text-slate-500">({Math.round(windowSize)} / {tracks.length})</span>}
        </h3>
        
        <div className="flex items-center gap-2">
            {isZoomed ? (
                <div className="flex gap-2 pointer-events-auto animate-in fade-in">
                    <span className="text-[9px] text-dj-accent bg-dj-accent/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <MoveHorizontal className="w-2.5 h-2.5" /> 拖拽
                    </span>
                    <button 
                        onClick={(e) => { e.stopPropagation(); resetView(); }}
                        className="text-[9px] text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 px-1.5 py-0.5 rounded flex items-center gap-1 border border-slate-600 transition-colors"
                    >
                        <RotateCcw className="w-2.5 h-2.5" /> 重置
                    </button>
                </div>
            ) : (
                tracks.length > 4 && (
                    <span className="text-[9px] text-slate-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ZoomIn className="w-2.5 h-2.5" /> 滚轮缩放
                    </span>
                )
            )}
        </div>
      </div>

      <div className="flex-1 min-h-0 pointer-events-none relative z-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={visibleData}
            margin={{
              top: 5,
              right: 10,
              left: -20,
              bottom: 0,
            }}
          >
            <defs>
              <linearGradient id="colorEnergy" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
              </linearGradient>
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
              formatter={(value: number, name: string, props: any) => [`能量: ${value}/10`, `#${props.payload.originalIndex} ${props.payload.title}`]}
            />
            <Area 
              type="monotone" 
              dataKey="energy" 
              stroke="#06b6d4" 
              fillOpacity={1} 
              fill="url(#colorEnergy)" 
              strokeWidth={2}
              animationDuration={300}
              isAnimationActive={!isDragging} // Disable animation while dragging for performance
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      {/* Mini-map Scrollbar Indicator */}
      {isZoomed && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800/50">
              <div 
                className="h-full bg-dj-accent/50 hover:bg-dj-accent rounded-full transition-all duration-75 cursor-grab"
                style={{
                    left: `${(windowStart / tracks.length) * 100}%`,
                    width: `${Math.max((windowSize / tracks.length) * 100, 5)}%`, // Minimum width visibility
                    position: 'absolute'
                }}
              />
          </div>
      )}
    </div>
  );
};

export default EnergyChart;