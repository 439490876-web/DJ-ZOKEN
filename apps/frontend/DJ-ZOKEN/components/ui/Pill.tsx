import React from 'react';

type PillVariant = 'default' | 'solid' | 'outline';

interface PillProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: PillVariant;
}

export const Pill: React.FC<PillProps> = ({
  variant = 'default',
  className = '',
  children,
  ...props
}) => {
  const variantClass =
    variant === 'solid'
      ? 'bg-white/15 text-white border border-white/20'
      : variant === 'outline'
      ? 'bg-transparent text-slate-300 border border-white/15'
      : 'glass-pill';

  const classes = [
    'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold',
    variantClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
};
