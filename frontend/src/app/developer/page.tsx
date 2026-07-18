'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { Project } from '@/lib/types';
import CreateProjectForm from '@/components/CreateProjectForm';
import ProjectsTable from '@/components/ProjectsTable';

export default function DeveloperDashboard() {
  const { session, profile, token, signOut, loading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const data = await apiFetch<Project[]>('/projects', {
        token: token ?? undefined,
      });
      setProjects(data);
    } catch (err: any) {
      setNotice(err?.message ?? 'Failed to load projects.');
    } finally {
      setProjectsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (session && token) {
      loadProjects();
    }
  }, [session, token, loadProjects]);

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16 text-slate-500">
        Loading…
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="text-slate-600">Please sign in to access the dashboard.</p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Sign in
        </Link>
      </main>
    );
  }

  if (profile && profile.role !== 'DEVELOPER' && profile.role !== 'ADMIN') {
    return (
      <main className="mx-auto max-w-2xl px-6 py-20">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-lg font-semibold text-amber-900">
            Developer access required
          </h1>
          <p className="mt-2 text-sm text-amber-800">
            Your account role is <strong>{profile.role}</strong>. Only
            DEVELOPER (or ADMIN) accounts can register projects. Ask an admin to
            promote your account, or contact support.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            V
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Developer Dashboard
            </h1>
            <p className="text-sm text-slate-500">
              Register and manage your carbon projects.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500">{profile?.email}</span>
          <Link
            href="/carbon-credits"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
          >
            Carbon Credits
          </Link>
          <button
            onClick={signOut}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </header>

      {notice && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {notice}
        </p>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <CreateProjectForm onCreated={loadProjects} />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Registered Projects
          </h2>
          <ProjectsTable projects={projects} loading={projectsLoading} />
        </section>
      </div>
    </main>
  );
}
