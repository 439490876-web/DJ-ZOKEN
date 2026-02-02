import React from 'react';

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'outline' | 'muted';
};

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  className = '',
  children,
  ...props
}) => {
  const variantClass =
    variant === 'outline'
      ? 'glass-card border border-white/15'
      : variant === 'muted'
      ? 'glass-card bg-white/5'
      : 'glass-card';
  const classes = [variantClass, className].filter(Boolean).join(' ');

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
};
