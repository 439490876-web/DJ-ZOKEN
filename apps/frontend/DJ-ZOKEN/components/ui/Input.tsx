import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', ...props }, ref) => {
    const classes = [
      'glass-input w-full px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-dj-accent/40 transition-all',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return <input ref={ref} className={classes} {...props} />;
  }
);

Input.displayName = 'Input';
