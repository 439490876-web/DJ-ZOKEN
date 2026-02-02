import React from 'react';

interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  value?: React.ReactNode;
  icon?: React.ReactNode;
  hint?: React.ReactNode;
}

export const Stat: React.FC<StatProps> = ({
  label,
  value,
  icon,
  hint,
  className = '',
  children,
  ...props
}) => {
  const classes = ['glass-card rounded-2xl border border-white/10 p-4', className]
    .filter(Boolean)
    .join(' ');

  if (label || value || icon || hint) {
    return (
      <div className={classes} {...props}>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{label}</span>
          {icon}
        </div>
        <div className="mt-2 text-xl font-semibold text-white">{value}</div>
        {hint && <div className="mt-1 text-[10px] text-slate-500">{hint}</div>}
      </div>
    );
  }

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
};
