import React from 'react';

/**
 * Shows one of several texts while always taking the width of the longest one,
 * so a button or badge that changes its text never pushes the controls next to it.
 */
export function StableLabel({ options, active, align = 'center' }: {options: React.ReactNode[];active: number;align?: 'center' | 'left';}) {
  return (
    <span className="inline-grid">
      {options.map((option, i) =>
      <span
        key={i}
        className={`col-start-1 row-start-1 whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-center'} ${i === active ? '' : 'invisible'}`}
        aria-hidden={i === active ? undefined : true}>
        
          {option}
        </span>
      )}
    </span>);

}