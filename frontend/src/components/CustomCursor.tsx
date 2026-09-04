'use client';

import { useEffect, useRef } from 'react';

type CursorTone = 'default' | 'button' | 'link' | 'card' | 'input';

const TONE_COLOR: Record<CursorTone, string> = {
  default: 'rgba(255,255,255,0.9)',
  button: 'rgba(155,107,255,1)',
  link: 'rgba(255,95,162,1)',
  card: 'rgba(52,227,255,0.95)',
  input: 'rgba(79,140,255,1)',
};

/**
 * Premium custom cursor:
 *  - glowing inner dot (fast follow)
 *  - delayed outer ring (smooth interpolation + spring lag)
 *  - contextual color changes over buttons / links / cards / inputs
 *  - magnetic pull toward the center of interactive elements
 *  - automatically disabled on touch / coarse-pointer devices
 */
export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only enable on fine-pointer, hover-capable devices.
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!fine) return;

    document.body.classList.add('custom-cursor-active');

    const dot = dotRef.current!;
    const ring = ringRef.current!;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let dotX = mouseX;
    let dotY = mouseY;
    let ringX = mouseX;
    let ringY = mouseY;
    let ringScale = 1;
    let ringTargetScale = 1;
    let tone: CursorTone = 'default';
    let magX = mouseX;
    let magY = mouseY;

    const lerp = (a: number, b: number, n: number) => a + (b - a) * n;

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      const el = e.target as HTMLElement | null;
      const interactive = el?.closest(
        'a, button, [role="button"], input, textarea, select, label',
      ) as HTMLElement | null;

      let nextTone: CursorTone = 'default';
      if (interactive) {
        if (interactive.tagName === 'A' || interactive.getAttribute('role') === 'button')
          nextTone = interactive.tagName === 'A' ? 'link' : 'button';
        else if (/^(INPUT|TEXTAREA|SELECT|LABEL)$/.test(interactive.tagName)) nextTone = 'input';
        else nextTone = 'button';
      } else if (el?.closest('[data-cursor="card"], .group, .card-hover')) {
        nextTone = 'card';
      }

      if (nextTone !== tone) {
        tone = nextTone;
        const color = TONE_COLOR[tone];
        dot.style.background = color;
        dot.style.boxShadow = `0 0 14px 2px ${color}`;
        ring.style.borderColor = color;
        ring.style.boxShadow = `0 0 22px -2px ${color}`;
      }

      // Magnetic pull toward the center of the hovered interactive element.
      if (interactive && nextTone !== 'input') {
        const r = interactive.getBoundingClientRect();
        magX = lerp(magX, r.left + r.width / 2, 0.35);
        magY = lerp(magY, r.top + r.height / 2, 0.35);
        ringTargetScale = 1.6;
      } else {
        magX = mouseX;
        magY = mouseY;
        ringTargetScale = nextTone === 'card' ? 1.9 : nextTone === 'default' ? 1 : 1.4;
      }
    };

    const onDown = () => (ringTargetScale = 0.8);
    const onUp = () => (ringTargetScale = 1.4);
    const onLeave = () => {
      dot.style.opacity = '0';
      ring.style.opacity = '0';
    };
    const onEnter = () => {
      dot.style.opacity = '1';
      ring.style.opacity = '1';
    };

    const loop = () => {
      // Dot follows quickly, with a light smoothing for "glow" feel.
      dotX = lerp(dotX, mouseX, 0.35);
      dotY = lerp(dotY, mouseY, 0.35);

      // Ring follows the magnetically-pulled target with more lag.
      ringX = lerp(ringX, magX, 0.15);
      ringY = lerp(ringY, magY, 0.15);
      ringScale = lerp(ringScale, ringTargetScale, 0.18);

      dot.style.transform = `translate3d(${dotX - 4}px, ${dotY - 4}px, 0)`;
      ring.style.transform = `translate3d(${ringX - 22}px, ${ringY - 22}px, 0) scale(${ringScale})`;

      raf = requestAnimationFrame(loop);
    };

    let raf = requestAnimationFrame(loop);
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
      document.body.classList.remove('custom-cursor-active');
    };
  }, []);

  return (
    <>
      <div
        ref={ringRef}
        className="cursor-ring hidden h-11 w-11 border border-white/60 transition-[width,height,opacity] duration-200 md:block"
        style={{ opacity: 0 }}
        aria-hidden
      />
      <div
        ref={dotRef}
        className="cursor-dot hidden h-2 w-2 bg-white md:block"
        style={{
          opacity: 0,
          boxShadow: '0 0 14px 2px rgba(255,255,255,0.9)',
        }}
        aria-hidden
      />
    </>
  );
}
