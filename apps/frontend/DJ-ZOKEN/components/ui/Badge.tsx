import React from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'muted';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  className = '',
  children,
  ...props
}) => {
  const variantClass =
    variant === 'success'
      ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30'
      : variant === 'warning'
      ? 'bg-amber-500/15 text-amber-200 border border-amber-500/30'
      : variant === 'danger'
      ? 'bg-rose-500/15 text-rose-200 border border-rose-500/30'
      : variant === 'muted'
      ? 'bg-white/5 text-slate-400 border border-white/10'
      : 'bg-white/10 text-white border border-white/15';

  const classes = [
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
    variantClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  );
};
