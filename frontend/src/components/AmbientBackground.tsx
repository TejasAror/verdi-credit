'use client';

/**
 * AmbientBackground — fixed, layered lighting for the whole app.
 * Matte-black base (from body) + drifting blue/violet/pink aurora blobs,
 * a faint grid, and a subtle noise/grain overlay. Pointer-events: none.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-grid-faint [background-size:54px_54px] opacity-[0.5] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />

      <div className="absolute -left-40 -top-48 h-[42rem] w-[42rem] animate-aurora rounded-full bg-accent-blue/25 blur-[120px]" />
      <div className="absolute -right-40 -top-24 h-[40rem] w-[40rem] animate-aurora rounded-full bg-accent-pink/20 blur-[130px] [animation-delay:-7s]" />
      <div className="absolute bottom-[-14rem] left-1/3 h-[46rem] w-[46rem] animate-aurora rounded-full bg-accent-violet/22 blur-[140px] [animation-delay:-13s]" />
      <div className="absolute right-1/4 top-1/2 h-[30rem] w-[30rem] animate-aurora rounded-full bg-accent-cyan/10 blur-[120px] [animation-delay:-3s]" />

      <div className="absolute inset-0 noise opacity-[0.18] mix-blend-overlay" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-ink-950/70" />
    </div>
  );
}
