import React from 'react';

export type SegmentedOption = {
  id: string;
  label: string;
  icon?: React.ReactNode;
};

type SegmentedControlProps = {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  size?: 'default' | 'compact';
  className?: string;
};

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  size = 'default',
  className = '',
}) => {
  return (
    <div
      className={`macos-segmented ${size === 'compact' ? 'macos-segmented--compact' : ''} ${className}`.trim()}
      role="tablist"
      aria-label="Segmented control"
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={`macos-segmented__item ${active ? 'is-active' : ''}`.trim()}
          >
            {option.icon}
            <span className={active ? 'is-active' : undefined}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};
