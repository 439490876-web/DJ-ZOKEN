import React from 'react';

type PanelProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'soft';
};

export const Panel: React.FC<PanelProps> = ({
  variant = 'default',
  className = '',
  children,
  ...props
}) => {
  const variantClass = variant === 'soft' ? 'panel-soft' : '';
  const classes = ['glass-panel', variantClass, className].filter(Boolean).join(' ');

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
};
