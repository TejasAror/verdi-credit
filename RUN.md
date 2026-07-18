# VerdiCred — Run Guide (Stage 1 + Admin Panel)

How to start the backend (NestJS) and frontend (Next.js 15) locally and talk
to your Supabase project.

---

## 0. Prerequisites
- Node.js >= 20
- npm >= 10
- A Supabase project. The keys are already wired:
  - backend `.env` → Supabase URL + anon key + **direct** Postgres URL (5432)
  - frontend `.env.local` → Supabase URL + publishable key

> The DB schema is already pushed to your Supabase project (tables `User`,
> `Project`, `AuditLog`; enums `Role`, `ProjectType`, `ProjectStatus`,
> `AuditLogAction`). If you ever need to re-sync:
> `cd backend && npx prisma db push`

---

## 1. Start the Backend (NestJS, port 3001)

```bash
cd backend
npm install            # first time only
npm run build          # compile (also runs prisma generate)
npm run start:dev      # watch mode, or:
npm run start          # production build from dist/src/main.js
```

Health:
- API base:        http://localhost:3001/api
- Swagger docs:    http://localhost:3001/api/docs

Expected boot log:
```
[Nest] ... Nest application successfully started
VerdiCred API listening on http://localhost:3001
Swagger docs available at http://localhost:3001/api/docs
```

---

## 2. Start the Frontend (Next.js 15, port 3000)

```bash
cd frontend
npm install            # first time only
npm run dev            # dev server, or:
npm run build && npm run start
```

Open: http://localhost:3000

Pages:
- `/`           landing
- `/login`      Supabase sign-in / sign-up
- `/developer`  create + list projects (DEVELOPER / ADMIN)
- `/admin`     **user role management + audit log (ADMIN only)**

---

## 3. Make yourself an Admin (one-time)

New Supabase accounts default to the **BUYER** role, so they cannot reach the
admin panel or create projects. Promote your user with the service-role key
(never expose this to the browser) via a one-off SQL in the Supabase SQL
editor, or via the Admin API. Easiest path:

```sql
-- In Supabase SQL editor (Dashboard -> SQL). Replace the email.
update "User"
set role = 'ADMIN'
where email = 'you@example.com';
```

(Or use the new admin panel itself once you have one admin: sign in as the
admin, open `/admin`, and change any user's role from the dropdown.)

---

## 4. Using the Admin Panel

1. Sign in as an **ADMIN** user.
2. Go to `/admin`.
3. **User Management** — every registered user is listed with their current
   role. Use the dropdown on any row to promote/demote. You'll be prompted for
   an optional reason. You cannot change your own role (no self-edit).
4. **Audit Log** — every role change is recorded here: timestamp, action
   (Promoted / Demoted / Changed), target user, previous → new role, and the
   reason. This replaces any manual SQL role edits.

API (all require `Authorization: Bearer <supabase_token>`):
- `GET  /api/admin/users`           → list users (ADMIN)
- `PATCH /api/admin/users/:id/role`  → `{ "role": "DEVELOPER", "reason"? }` (ADMIN)
- `GET  /api/admin/audit-logs`       → list role-change history (ADMIN)

Business rules enforced server-side:
- Only **ADMIN** can call these (global `RolesGuard` + `@Roles(ADMIN)`).
- An admin cannot change **their own** role.
- The **last ADMIN cannot be removed** (prevents locking everyone out).
- Every successful change writes an immutable `AuditLog` row.

---

## 5. Verify it's running

```bash
# No token -> 401 (auth + RBAC gate)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/admin/users

# With a real admin token -> 200 + JSON
curl -s -H "Authorization: Bearer $SUPABASE_TOKEN" \
        http://localhost:3001/api/admin/users
```

---

## 6. Stopping

- `Ctrl+C` in each terminal, or kill the background processes.
- Backend PID is reported at boot; frontend is the `next dev` process.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Backend won't connect to DB (`P1001`) | Use the **direct** Postgres URL (port 5432), not the pooled 6543. See `backend/.env`. |
| `Cannot find module 'ws'` at boot | Should not happen — backend uses `@supabase/auth-js` (no Realtime). If you see it, you changed `SupabaseService`. |
| `401 Access denied. Required role(s): ADMIN` on `/admin` | Your account is BUYER — promote it (section 3). |
| Frontend can't reach API | Check `NEXT_PUBLIC_API_BASE_URL` in `frontend/.env.local` points to `http://localhost:3001/api`. |
| Swagger shows no `/admin` routes | Restart the backend after `npm run build` so the new compiled code is served. |
