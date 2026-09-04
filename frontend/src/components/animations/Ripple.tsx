'use client';

import { useState, useCallback } from 'react';

/**
 * Ripple — a material-style ripple that expands from the click point.
 * Mounted inside a `relative overflow-hidden` button.
 */
export function Ripple() {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([]);

  const addRipple = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      const id = Date.now() + Math.random();
      setRipples((r) => [...r, { id, x, y, size }]);
      setTimeout(() => setRipples((r) => r.filter((rp) => rp.id !== id)), 700);
    },
    [],
  );

  // Intercept clicks at the wrapper level without breaking button onClick.
  // We attach via event delegation on the parent button using capture.
  return (
    <span
      aria-hidden
      onClickCapture={(e: React.MouseEvent) => addRipple(e as unknown as React.MouseEvent<HTMLButtonElement>)}
      className="pointer-events-none absolute inset-0 z-0"
    >
      {ripples.map((rp) => (
        <span
          key={rp.id}
          className="absolute rounded-full bg-white/30"
          style={{
            left: rp.x,
            top: rp.y,
            width: rp.size,
            height: rp.size,
            animation: 'ripple 0.65s linear forwards',
          }}
        />
      ))}
    </span>
  );
}
