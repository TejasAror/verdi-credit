'use client';

import { Project, ProjectStatus } from '@/lib/types';

const STATUS_STYLES: Record<ProjectStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING_VERIFICATION: 'bg-amber-100 text-amber-800',
  VERIFIED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  RETIRED: 'bg-slate-200 text-slate-500',
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
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Loading projects…
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
        No projects registered yet. Create your first project to get started.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Project</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Methodology</th>
              <th className="px-4 py-3 font-medium">Expected (t/yr)</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projects.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {p.projectName}
                </td>
                <td className="px-4 py-3 text-slate-600">{p.projectType}</td>
                <td className="px-4 py-3 text-slate-600">{p.methodology}</td>
                <td className="px-4 py-3 text-slate-600">
                  {p.expectedAnnualTonnes.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_STYLES[p.status] ?? 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(p.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
