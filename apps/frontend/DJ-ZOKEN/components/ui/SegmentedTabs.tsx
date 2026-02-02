import React from 'react';

interface SegmentedTabsProps extends React.HTMLAttributes<HTMLDivElement> {}

export const SegmentedTabs: React.FC<SegmentedTabsProps> = ({
  className = '',
  children,
  ...props
}) => {
  const classes = [
    'inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1',
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
