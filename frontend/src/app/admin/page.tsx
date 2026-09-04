'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth-context';
import { listUsers, listAuditLogs, changeUserRole } from '@/lib/api';
import { ALL_ROLES, AuditLogEntry, Role, VerdiCredUser } from '@/lib/types';
import {
  PremiumTable,
  TableRow,
  Td,
  Th,
  Badge,
  Notice,
  EmptyState,
  AppShell,
  PageHeader,
  Stagger,
  Rise,
  riseItem,
} from '@/components/design-system';
import { useToast } from '@/components/Toast';
import { Shield, AlertTriangle, UserCog, History } from 'lucide-react';
import { formatDateTime, short } from '@/lib/format';

const ROLE_TONE: Record<Role, Parameters<typeof Badge>[0]['tone']> = {
  ADMIN: 'violet',
  AUDITOR: 'blue',
  DEVELOPER: 'emerald',
  BUYER: 'slate',
};

const ACTION_LABEL: Record<AuditLogEntry['action'], string> = {
  ROLE_CHANGED: 'Changed',
  ROLE_PROMOTED: 'Promoted',
  ROLE_DEMOTED: 'Demoted',
};

export default function AdminPage() {
  const { session, profile, token, loading } = useAuth();
  const { success, error: toastError } = useToast();
  const [users, setUsers] = useState<VerdiCredUser[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      const [u, l] = await Promise.all([listUsers(token), listAuditLogs(token)]);
      setUsers(u);
      setLogs(l);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load admin data.');
      toastError('Failed to load admin data', e?.message);
    } finally {
      setBusy(false);
    }
  }, [token, toastError]);

  useEffect(() => {
    if (session && profile?.role === 'ADMIN') load();
  }, [session, profile, load]);

  if (loading) {
    return (
      <AppShell>
        <div className="glass animate-pulse rounded-3xl p-10 text-content-faint">Loading…</div>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell max="3xl">
        <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Sign in required" description="Please sign in to access the admin panel." />
      </AppShell>
    );
  }

  if (profile?.role !== 'ADMIN') {
    return (
      <AppShell max="3xl">
        <Notice tone="error">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold text-content">Admin access required</p>
              <p className="mt-1 text-content-muted">
                Your role is <strong>{profile?.role}</strong>. Only ADMIN users can manage roles and
                view the audit log.
              </p>
            </div>
          </div>
        </Notice>
      </AppShell>
    );
  }

  const handleRoleChange = async (user: VerdiCredUser, next: Role) => {
    if (next === user.role) return;
    const reason = window.prompt(
      `Change ${user.email ?? user.id} from ${user.role} to ${next}. Reason (optional):`,
    );
    if (reason === null) return;
    setError(null);
    setNote(null);
    try {
      await changeUserRole(token!, user.id, next, reason || undefined);
      setNote(`Updated ${user.email ?? user.id} → ${next}.`);
      success('Role updated', `${user.email ?? user.id} → ${next}`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Role change failed.');
      toastError('Role change failed', e?.message);
    }
  };

  return (
    <AppShell max="6xl">
      <PageHeader
        badge="RBAC · User Management"
        title="Admin Panel"
        subtitle="User role management & audit log."
        icon={<Shield className="h-6 w-6" />}
      />

      {error && <div className="mb-5"><Notice tone="error">{error}</Notice></div>}
      {note && <div className="mb-5"><Notice tone="success">{note}</Notice></div>}

      <section className="mb-10">
        <Rise>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-content">
            <UserCog className="h-5 w-5 text-accent-violet" /> Registered Users
          </h2>
        </Rise>
        <PremiumTable
          head={['Email', 'User ID', 'Current Role', 'Change Role']}
        >
          <Stagger>
            {users.map((u) => (
              <TableRow key={u.id}>
                <Td className="font-semibold text-content">{u.email ?? '(no email)'}</Td>
                <Td className="font-mono text-xs text-content-faint">{short(u.id, 5)}</Td>
                <Td>
                  <Badge tone={ROLE_TONE[u.role]}>{u.role}</Badge>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <select
                      value={u.role}
                      disabled={busy || u.id === profile?.id}
                      onChange={(e) => handleRoleChange(u, e.target.value as Role)}
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-content outline-none transition-colors focus:border-accent-violet/60 disabled:opacity-50"
                    >
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r} className="bg-ink-800">
                          {r}
                        </option>
                      ))}
                    </select>
                    {u.id === profile?.id && <span className="text-xs text-content-faint">(you)</span>}
                  </div>
                </Td>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <Td colSpan={4} className="text-center">
                  No users found.
                </Td>
              </TableRow>
            )}
          </Stagger>
        </PremiumTable>
      </section>

      <section>
        <Rise>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-content">
            <History className="h-5 w-5 text-accent-blue" /> Audit Log
          </h2>
        </Rise>
        <PremiumTable
          head={['When', 'Action', 'Target', 'From → To', 'Reason']}
        >
          <Stagger>
            {logs.map((l) => (
              <TableRow key={l.id}>
                <Td className="text-content-faint">{formatDateTime(l.createdAt)}</Td>
                <Td>
                  <Badge tone="slate">{ACTION_LABEL[l.action]}</Badge>
                </Td>
                <Td className="font-semibold text-content">{l.target?.email ?? short(l.targetId, 5)}</Td>
                <Td className="text-content-muted">
                  {l.previousRole} → {l.newRole}
                </Td>
                <Td className="text-content-faint">{l.reason ?? '—'}</Td>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <Td colSpan={5} className="text-center">
                  No role changes recorded yet.
                </Td>
              </TableRow>
            )}
          </Stagger>
        </PremiumTable>
      </section>
    </AppShell>
  );
}
