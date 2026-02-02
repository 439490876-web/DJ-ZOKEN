import React from 'react';

interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  icon,
  action,
  className = '',
  children,
  ...props
}) => {
  const classes = ['flex items-center justify-between gap-3', className]
    .filter(Boolean)
    .join(' ');

  if (title || subtitle || icon || action) {
    return (
      <div className={classes} {...props}>
        <div className="flex items-center gap-2">
          {icon}
          <div>
            {title && <div className="text-sm font-semibold text-white">{title}</div>}
            {subtitle && <div className="text-xs text-slate-400">{subtitle}</div>}
          </div>
        </div>
        {action}
      </div>
    );
  }

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
};
