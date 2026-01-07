import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Track } from '../types';

interface EnergyChartProps {
  tracks: Track[];
}

const EnergyChart: React.FC<EnergyChartProps> = ({ tracks }) => {
  const data = tracks.map((track, index) => ({
    name: index + 1,
    title: track.title,
    energy: track.energy,
    bpm: track.bpm
  }));

  if (tracks.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center border border-dashed border-slate-700 rounded-lg text-slate-500 text-sm">
        添加歌曲以查看能量流向
      </div>
    );
  }

  return (
    <div className="h-48 w-full bg-dj-panel rounded-lg p-2 shadow-lg border border-slate-700">
      <h3 className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider pl-2">Set 能量流向图</h3>
      <ResponsiveContainer width="100%" height="85%">
        <AreaChart
          data={data}
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
          <XAxis dataKey="name" stroke="#64748b" tick={{fontSize: 10}} />
          <YAxis stroke="#64748b" domain={[0, 12]} hide />
          <Tooltip 
            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }}
            itemStyle={{ color: '#06b6d4' }}
            labelStyle={{ display: 'none' }}
            formatter={(value: number, name: string, props: any) => [`能量: ${value}/10`, props.payload.title]}
          />
          <Area 
            type="monotone" 
            dataKey="energy" 
            stroke="#06b6d4" 
            fillOpacity={1} 
            fill="url(#colorEnergy)" 
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default EnergyChart;