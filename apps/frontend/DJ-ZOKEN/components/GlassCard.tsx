import React from 'react';

export type GlassCardProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: 'default' | 'subtle';
};

export const GlassCard: React.FC<GlassCardProps> = ({ tone = 'default', className = '', ...props }) => {
  const toneClass = tone === 'subtle' ? 'glass-subtle' : 'glass-card';
  return (
    <div
      className={`${toneClass} ${className}`.trim()}
      {...props}
    />
  );
};
