'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { Project } from '@/lib/types';
import CreateProjectForm from '@/components/CreateProjectForm';
import ProjectsTable from '@/components/ProjectsTable';
import { useToast } from '@/components/Toast';
import {
  AppShell,
  PageHeader,
  Notice,
  MetricCard,
  Rise,
  riseItem,
  staggerContainer,
  EmptyState,
} from '@/components/design-system';
import { Leaf, FolderOpen, Coins, Activity, AlertTriangle } from 'lucide-react';

export default function DeveloperDashboard() {
  const { session, profile, token, loading } = useAuth();
  const { error: toastError } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const data = await apiFetch<Project[]>('/projects', { token: token ?? undefined });
      setProjects(data);
    } catch (err: any) {
      setNotice(err?.message ?? 'Failed to load projects.');
      toastError('Could not load projects', err?.message);
    } finally {
      setProjectsLoading(false);
    }
  }, [token, toastError]);

  useEffect(() => {
    if (session && token) loadProjects();
  }, [session, token, loadProjects]);

  if (loading) {
    return (
      <AppShell>
        <div className="glass animate-pulse rounded-3xl p-10 text-content-faint">Loading…</div>
      </AppShell>
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
      <AppShell max="3xl">
        <Notice tone="warning">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold text-content">Developer access required</p>
              <p className="mt-1 text-content-muted">
                Your account role is <strong>{profile.role}</strong>. Only DEVELOPER (or ADMIN)
                accounts can register projects. Ask an admin to promote your account, or contact
                support.
              </p>
            </div>
          </div>
        </Notice>
      </AppShell>
    );
  }

  const verified = projects.filter((p) => p.status === 'VERIFIED').length;
  const pending = projects.filter((p) => p.status === 'PENDING_VERIFICATION').length;

  return (
    <AppShell max="6xl">
      <PageHeader
        badge="Stage 1 · Project Registration"
        title="Developer Dashboard"
        subtitle="Register and manage your carbon projects."
        icon={<FolderOpen className="h-6 w-6" />}
      />

      {notice && <div className="mb-5"><Notice tone="error">{notice}</Notice></div>}

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3"
      >
        <motion.div variants={riseItem}>
          <MetricCard label="Projects" value={projects.length} icon={<FolderOpen className="h-5 w-5" />} tone="violet" />
        </motion.div>
        <motion.div variants={riseItem}>
          <MetricCard label="Verified" value={verified} icon={<Leaf className="h-5 w-5" />} tone="emerald" />
        </motion.div>
        <motion.div variants={riseItem}>
          <MetricCard label="Pending" value={pending} icon={<Activity className="h-5 w-5" />} tone="amber" />
        </motion.div>
      </motion.div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <CreateProjectForm onCreated={loadProjects} />
        <section className="space-y-3">
          <Rise>
            <h2 className="text-lg font-semibold text-content">Registered Projects</h2>
          </Rise>
          <ProjectsTable projects={projects} loading={projectsLoading} />
        </section>
      </div>
    </AppShell>
  );
}
