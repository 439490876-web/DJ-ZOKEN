import React, { useState, useEffect, useRef, useId } from 'react';
import { GlassCard } from './GlassCard';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Customized, usePlotArea, useXAxisDomain, useYAxisDomain } from 'recharts';
import { Track } from '../types';
import { ZoomIn, MoveHorizontal, RotateCcw, ChevronLeft, ChevronRight, Flame } from 'lucide-react';

interface EnergyChartProps {
  tracks: Track[];
}

type HeatBand = {
  min: number;
  max: number;
  from: string;
  to: string;
};

const HEAT_BANDS: HeatBand[] = [
  { min: 1, max: 3, from: '#0B1D3A', to: '#2EC4D6' }, // Deep Ocean Blue -> Cyan
  { min: 4, max: 5, from: '#1F9E9A', to: '#7BC96F' }, // Teal -> Lime Green
  { min: 6, max: 7, from: '#F4C45E', to: '#F28C3B' }, // Warm Yellow -> Orange
  { min: 8, max: 9, from: '#E26A2C', to: '#C04B9B' }, // Deep Orange -> Magenta
  { min: 10, max: 10, from: '#E93B2F', to: '#E23BB8' }, // Vibrant Red -> Blazing Fuchsia
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '').trim();
  const full = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized;
  const intVal = parseInt(full, 16);
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255,
  };
};

const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(clamp(Math.round(r), 0, 255))}${toHex(clamp(Math.round(g), 0, 255))}${toHex(clamp(Math.round(b), 0, 255))}`;
};

const mixHex = (from: string, to: string, t: number) => {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const k = clamp(t, 0, 1);
  return rgbToHex(a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k);
};

const getHeatBand = (value: number) => {
  return HEAT_BANDS.find((band) => value >= band.min && value <= band.max) || HEAT_BANDS[HEAT_BANDS.length - 1];
};

const getHeatColor = (value?: number, heatStatus?: string) => {
  if (heatStatus !== 'ok' || typeof value !== 'number' || Number.isNaN(value)) {
    return '#A59AA6';
  }
  const clamped = clamp(value, 1, 10);
  const band = getHeatBand(clamped);
  const range = Math.max(1, band.max - band.min);
  const t = range === 0 ? 1 : (clamped - band.min) / range;
  return mixHex(band.from, band.to, t);
};

type ChartPoint = {
  x: number;
  y: number;
  energy: number;
  resonance?: number;
  heatStatus?: string;
};

type Segment = {
  d: string;
  fillD: string;
  startColor: string;
  endColor: string;
};

const getSegmentControls = (p0: ChartPoint, p1: ChartPoint, p2: ChartPoint, p3: ChartPoint) => {
  const smoothing = 1;
  const c1x = p1.x + (p2.x - p0.x) / 6 * smoothing;
  const c1y = p1.y + (p2.y - p0.y) / 6 * smoothing;
  const c2x = p2.x - (p3.x - p1.x) / 6 * smoothing;
  const c2y = p2.y - (p3.y - p1.y) / 6 * smoothing;
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);
  return {
    c1: { x: c1x, y: clamp(c1y, minY, maxY) },
    c2: { x: c2x, y: clamp(c2y, minY, maxY) },
  };
};

const SegmentedEnergyCurve: React.FC<any> = ({ data }) => {
  const id = useId().replace(/:/g, '');
  const plotArea = usePlotArea();
  const xDomain = useXAxisDomain();
  const yDomain = useYAxisDomain();

  if (!plotArea) return null;

  if (!data || data.length < 2) return null;

  const resolvedXDomain = (Array.isArray(xDomain) && xDomain.length === 2)
    ? (xDomain as number[])
    : [data[0].originalIndex, data[data.length - 1].originalIndex];
  const resolvedYDomain = (Array.isArray(yDomain) && yDomain.length === 2)
    ? (yDomain as number[])
    : [0, 12];

  const xMin = resolvedXDomain[0] ?? data[0].originalIndex;
  const xMax = resolvedXDomain[1] ?? data[data.length - 1].originalIndex;
  const yMin = resolvedYDomain[0] ?? 0;
  const yMax = resolvedYDomain[1] ?? 12;
  const xSpan = Math.max(1, xMax - xMin);
  const ySpan = Math.max(1, yMax - yMin);

  const xScale = (value: number) => plotArea.x + ((value - xMin) / xSpan) * plotArea.width;
  const yScale = (value: number) => plotArea.y + ((yMax - value) / ySpan) * plotArea.height;

  const points: ChartPoint[] = data.map((entry: any) => ({
    x: xScale(entry.originalIndex),
    y: yScale(entry.energy),
    energy: entry.energy,
    resonance: entry.resonance,
    heatStatus: entry.heatStatus,
  }));

  const baseY = yScale(0);

  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || points[i + 1];
    const { c1, c2 } = getSegmentControls(p0, p1, p2, p3);
    const d = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
    const fillD = `${d} L ${p2.x} ${baseY} L ${p1.x} ${baseY} Z`;
    segments.push({
      d,
      fillD,
      startColor: getHeatColor(p1.resonance, p1.heatStatus),
      endColor: getHeatColor(p2.resonance, p2.heatStatus),
    });
  }

  const peaks = points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) return false;
    const prev = points[index - 1].energy;
    const next = points[index + 1].energy;
    return point.energy > prev && point.energy >= next;
  });

  return (
    <>
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect x={plotArea.x} y={plotArea.y} width={plotArea.width} height={plotArea.height} />
        </clipPath>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.7 0"
          />
        </filter>
        {segments.map((segment, index) => (
          <linearGradient
            key={`seg-${index}`}
            id={`${id}-seg-${index}`}
            gradientUnits="userSpaceOnUse"
            x1={points[index].x}
            y1={points[index].y}
            x2={points[index + 1].x}
            y2={points[index + 1].y}
          >
            <stop offset="0%" stopColor={segment.startColor} />
            <stop offset="100%" stopColor={segment.endColor} />
          </linearGradient>
        ))}
        {segments.map((segment, index) => (
          <linearGradient
            key={`seg-fill-${index}`}
            id={`${id}-seg-fill-${index}`}
            gradientUnits="userSpaceOnUse"
            x1={points[index].x}
            y1={points[index].y}
            x2={points[index + 1].x}
            y2={points[index + 1].y}
          >
            <stop offset="0%" stopColor={segment.startColor} stopOpacity={0.28} />
            <stop offset="100%" stopColor={segment.endColor} stopOpacity={0.22} />
          </linearGradient>
        ))}
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        {segments.map((segment, index) => (
          <path
            key={`fill-${index}`}
            d={segment.fillD}
            fill={`url(#${id}-seg-fill-${index})`}
            mask="url(#fadeMask)"
          />
        ))}
        {segments.map((segment, index) => (
          <path
            key={`stroke-${index}`}
            d={segment.d}
            fill="none"
            stroke={`url(#${id}-seg-${index})`}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {peaks.map((peak, index) => {
          const color = getHeatColor(peak.resonance, peak.heatStatus);
          return (
            <circle
              key={`peak-${index}`}
              cx={peak.x}
              cy={peak.y}
              r={3.2}
              fill={color}
              filter={`url(#${id}-glow)`}
            />
          );
        })}
      </g>
    </>
  );
};

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
      <GlassCard className="h-52 flex items-center justify-center border border-dashed border-white/15 rounded-lg text-slate-500 text-xs">
        Add tracks to view Energy Flow (添加歌曲以查看能量流向)
      </GlassCard>
    );
  }

  // Calculate UI states / 计算 UI 状态
  const isZoomed = windowSize < tracks.length - 0.5;
  const canScrollLeft = isZoomed && windowStart > 0.5;
  const canScrollRight = isZoomed && (windowStart + windowSize) < tracks.length - 0.5;

  return (
    <GlassCard 
        className="h-52 w-full rounded-lg p-2 flex flex-col relative overflow-hidden group select-none"
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
        <div className="hidden sm:flex items-center gap-2 text-[9px] text-slate-500 glass-pill px-2 py-0.5 rounded-full">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#E23BB8]"></span>Anthem (10)</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#C04B9B]"></span>Hit (8-9)</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#F28C3B]"></span>Pop (6-7)</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#7BC96F]"></span>Std (4-5)</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#2EC4D6]"></span>Deep (1-3)</span>
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
                        className="text-[9px] text-slate-300 hover:text-white btn-secondary px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
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
              {/* Vertical Opacity Mask (垂直透明度遮罩) */}
              <linearGradient id="opacityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="white" stopOpacity={0.7}/>
                <stop offset="95%" stopColor="white" stopOpacity={0.05}/>
              </linearGradient>
              <mask id="fadeMask">
                  <rect x="0" y="0" width="100%" height="100%" fill="url(#opacityGradient)" />
              </mask>
            </defs>
            <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.12)" vertical={false} />
            <XAxis 
                dataKey="originalIndex" 
                stroke="#C9B7AC"
                tick={{fontSize: 9}} 
                type="number" 
                domain={['dataMin', 'dataMax']}
                interval={0}
                allowDecimals={false}
                tickCount={Math.min(visibleData.length, 10)}
            />
            <YAxis stroke="#C9B7AC" domain={[0, 12]} hide />
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(42, 32, 52, 0.86)', borderColor: 'rgba(255,255,255,0.18)', color: '#F7ECE7', fontSize: '10px', borderRadius: '10px', backdropFilter: 'blur(12px)' }}
              itemStyle={{ color: '#F4B15E' }}
              labelStyle={{ display: 'none' }}
              formatter={(value: number, name: string, props: any) => {
                  const heatReady = props.payload.heatStatus === 'ok' && typeof props.payload.resonance === 'number';
                  const resonanceValue = heatReady ? props.payload.resonance : null;
                  const resonanceLabel = heatReady ? `${resonanceValue}/10` : (props.payload.heatStatus === 'pending' ? '正在解析' : '—');
                  const resonanceClass = heatReady
                    ? (resonanceValue >= 10 ? 'text-[#E23BB8] font-bold' :
                      resonanceValue >= 8 ? 'text-[#C04B9B] font-bold' : 
                      resonanceValue >= 6 ? 'text-[#F28C3B]' :
                      resonanceValue <= 3 ? 'text-[#2EC4D6]' : 'text-[#7BC96F]')
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
              stroke="transparent" 
              strokeWidth={0}
              fill="transparent"
              animationDuration={300}
              isAnimationActive={!isDragging} // Disable animation during drag for perf / 拖拽时禁用动画
            />
            <Customized component={(props: any) => <SegmentedEnergyCurve {...props} data={visibleData} />} />
          </AreaChart>
        </ResponsiveContainer>
        
        {/* Navigation Arrows (导航箭头) */}
        {canScrollLeft && (
            <button 
                onClick={(e) => slideView('left', e)}
                className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-auto p-1.5 rounded-r-lg btn-secondary text-slate-400 hover:text-white transition-all opacity-0 group-hover:opacity-100 z-20"
            >
                <ChevronLeft className="w-4 h-4" />
            </button>
        )}
        
        {canScrollRight && (
            <button 
                onClick={(e) => slideView('right', e)}
                className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-auto p-1.5 rounded-l-lg btn-secondary text-slate-400 hover:text-white transition-all opacity-0 group-hover:opacity-100 z-20"
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
    </GlassCard>
  );
};

export default EnergyChart;
