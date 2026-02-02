import React from 'react';

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  className = '',
  children,
  ...props
}) => {
  const classes = [
    'glass-card border border-dashed border-white/15 rounded-2xl p-8 text-center text-slate-300',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (title || description || icon || action) {
    return (
      <div className={classes} {...props}>
        {icon && <div className="flex justify-center mb-4">{icon}</div>}
        {title && <div className="text-lg font-semibold text-white">{title}</div>}
        {description && <div className="mt-2 text-sm text-slate-400">{description}</div>}
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    );
  }

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
};
