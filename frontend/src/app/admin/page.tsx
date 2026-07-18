'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import {
  listUsers,
  listAuditLogs,
  changeUserRole,
} from '@/lib/api';
import { ALL_ROLES, AuditLogEntry, Role, VerdiCredUser } from '@/lib/types';

const ROLE_BADGE: Record<Role, string> = {
  ADMIN: 'bg-purple-100 text-purple-800',
  AUDITOR: 'bg-blue-100 text-blue-800',
  DEVELOPER: 'bg-emerald-100 text-emerald-800',
  BUYER: 'bg-slate-100 text-slate-700',
};

const ACTION_LABEL: Record<AuditLogEntry['action'], string> = {
  ROLE_CHANGED: 'Changed',
  ROLE_PROMOTED: 'Promoted',
  ROLE_DEMOTED: 'Demoted',
};

export default function AdminPage() {
  const { session, profile, token, signOut, loading } = useAuth();
  const [users, setUsers] = useState<VerdiCredUser[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      const [u, l] = await Promise.all([
        listUsers(token),
        listAuditLogs(token),
      ]);
      setUsers(u);
      setLogs(l);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load admin data.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    if (session && profile?.role === 'ADMIN') load();
  }, [session, profile, load]);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16 text-slate-500">Loading…</main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="text-slate-600">Please sign in to access the admin panel.</p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Sign in
        </Link>
      </main>
    );
  }

  if (profile?.role !== 'ADMIN') {
    return (
      <main className="mx-auto max-w-2xl px-6 py-20">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-lg font-semibold text-red-900">Admin access required</h1>
          <p className="mt-2 text-sm text-red-800">
            Your role is <strong>{profile?.role}</strong>. Only ADMIN users can
            manage roles and view the audit log.
          </p>
        </div>
      </main>
    );
  }

  const handleRoleChange = async (user: VerdiCredUser, next: Role) => {
    if (next === user.role) return;
    const reason = window.prompt(
      `Change ${user.email ?? user.id} from ${user.role} to ${next}. Reason (optional):`,
    );
    if (reason === null) return; // cancelled
    setError(null);
    setNote(null);
    try {
      await changeUserRole(token!, user.id, next, reason || undefined);
      setNote(`Updated ${user.email ?? user.id} → ${next}.`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Role change failed.');
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-600 text-sm font-bold text-white">
            A
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Admin Panel</h1>
            <p className="text-sm text-slate-500">
              User role management &amp; audit log.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500">{profile?.email}</span>
          <Link
            href="/developer"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
          >
            Dashboard
          </Link>
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

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}
      {note && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{note}</p>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Registered Users</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">User ID</th>
                  <th className="px-4 py-3 font-medium">Current Role</th>
                  <th className="px-4 py-3 font-medium">Change Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {u.email ?? '(no email)'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {u.id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE[u.role]}`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        disabled={busy || u.id === profile?.id}
                        onChange={(e) => handleRoleChange(u, e.target.value as Role)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:opacity-50"
                      >
                        {ALL_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      {u.id === profile?.id && (
                        <span className="ml-2 text-xs text-slate-400">(you)</span>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Audit Log</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Target</th>
                  <th className="px-4 py-3 font-medium">From → To</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {ACTION_LABEL[l.action]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {l.target?.email ?? l.targetId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {l.previousRole} → {l.newRole}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {l.reason ?? '—'}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      No role changes recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
