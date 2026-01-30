import React from 'react';

export type GlassPanelProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: 'default' | 'soft';
};

export const GlassPanel: React.FC<GlassPanelProps> = ({ tone = 'default', className = '', ...props }) => {
  const toneClass = tone === 'soft' ? 'panel-soft' : '';
  return (
    <div
      className={`glass-panel ${toneClass} ${className}`.trim()}
      {...props}
    />
  );
};
