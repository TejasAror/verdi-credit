import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
          V
        </div>
        <h1 className="text-2xl font-bold text-slate-900">VerdiCred</h1>
      </div>
      <h2 className="text-3xl font-bold tracking-tight text-slate-900">
        Trusted digital carbon credit verification
      </h2>
      <p className="mt-4 text-lg text-slate-600">
        VerdiCred eliminates fraud, double-counting, and greenwashing in carbon
        markets by linking real-world sequestration to traceable on-chain
        credits.
      </p>
      <p className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <span className="font-semibold text-slate-900">
          Stage 1 — Project Registration &amp; Onboarding
        </span>{' '}
        is live. Developers can register projects; the backend validates
        geo-polygons and methodology, and runs an (initially mock) overlap
        pre-screen against future double-counting.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/login"
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Sign in
        </Link>
        <Link
          href="/developer"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Developer Dashboard
        </Link>
        <Link
          href="/carbon-credits"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Carbon Credits
        </Link>
        <Link
          href="/marketplace"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Marketplace
        </Link>
      </div>
    </main>
  );
}
