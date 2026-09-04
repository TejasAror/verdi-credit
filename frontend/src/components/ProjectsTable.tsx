'use client';

import Link from 'next/link';
import { Project, ProjectStatus } from '@/lib/types';
import { DataTable, TableRow, Td, Th, StatusBadge } from '@/components/parts';
import { formatDate, short } from '@/lib/format';
import { FolderOpen, ArrowUpRight } from 'lucide-react';

const TYPE_TONE: Record<Project['projectType'], string> = {
  REFORESTATION: 'text-accent-emerald',
  SOIL_CARBON: 'text-accent-amber',
  RENEWABLE_ENERGY: 'text-accent-cyan',
};

export default function ProjectsTable({
  projects,
  loading,
}: {
  projects: Project[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="glass animate-pulse rounded-3xl p-6 text-sm text-content-faint">
        Loading projects…
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-14 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-content-faint">
          <FolderOpen className="h-6 w-6" />
        </div>
        <p className="text-base font-semibold text-content">No projects yet</p>
        <p className="mt-1 text-sm text-content-muted">Create your first project to get started.</p>
      </div>
    );
  }

  return (
    <DataTable
      head={['Project', 'Type', 'Methodology', 'Expected (t/yr)', 'Status', 'Created']}
    >
      {projects.map((p) => (
        <TableRow key={p.id}>
          <Td className="font-semibold text-content">
            <Link
              href={`/projects/${p.id}`}
              className="group/row inline-flex items-center gap-1.5 text-content transition-colors hover:text-gradient"
            >
              {p.projectName}
              <ArrowUpRight className="h-3.5 w-3.5 text-content-faint opacity-0 transition-all group-hover/row:opacity-100 group-hover/row:translate-x-0.5 group-hover/row:-translate-y-0.5" />
            </Link>
          </Td>
          <Td className={TYPE_TONE[p.projectType]}>{p.projectType}</Td>
          <Td>{p.methodology}</Td>
          <Td className="tabular-nums">{p.expectedAnnualTonnes.toLocaleString()}</Td>
          <Td>
            <StatusBadge status={p.status as ProjectStatus} />
          </Td>
          <Td className="text-content-faint">{formatDate(p.createdAt)}</Td>
        </TableRow>
      ))}
    </DataTable>
  );
}
