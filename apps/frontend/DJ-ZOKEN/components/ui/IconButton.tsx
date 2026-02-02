import React from 'react';

type IconButtonVariant = 'primary' | 'ghost' | 'danger' | 'subtle';
type IconButtonSize = 'sm' | 'md' | 'lg';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

export const IconButton: React.FC<IconButtonProps> = ({
  variant = 'ghost',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...props
}) => {
  const variantClass =
    variant === 'primary'
      ? 'btn-candy'
      : variant === 'danger'
      ? 'btn-candy-danger'
      : variant === 'ghost'
      ? 'btn-ghost'
      : 'bg-white/10 text-white border border-white/10';

  const sizeClass =
    size === 'sm'
      ? 'w-8 h-8 text-xs'
      : size === 'lg'
      ? 'w-12 h-12 text-sm'
      : 'w-10 h-10 text-sm';

  const classes = [
    'inline-flex items-center justify-center rounded-xl transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dj-accent/50',
    variantClass,
    sizeClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
};
