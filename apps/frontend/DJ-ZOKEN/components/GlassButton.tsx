import React from 'react';

export type GlassButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type GlassButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: GlassButtonVariant;
};

const variantClassMap: Record<GlassButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

export const GlassButton: React.FC<GlassButtonProps> = ({
  variant = 'secondary',
  className = '',
  ...props
}) => {
  return (
    <button
      className={`glass-button ${variantClassMap[variant]} ${className}`.trim()}
      {...props}
    />
  );
};
