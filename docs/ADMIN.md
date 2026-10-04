# NFAI Labs — Admin & Data Management

| Field | Value |
|---|---|
| Document | Admin system contract and reference |
| Phase | Phase 3 — Admin & Data Management |
| Status | In progress. Decisions D-009 and D-031 to D-035 are Proposed until the owner accepts Phase 3. |
| Last updated | 2026-09-29 |

This is the integration contract the Phase 3 threads build against. Thread ownership is in the Phase 3 brief; this document fixes the interfaces between them. Where a thread needs something different, it reports it to the coordinator instead of changing another thread's files.

---

## 1. Placement (D-009)

Admin lives in the same Next.js application under `/admin`, behind authentication and authorization. No second app or repository.

- Public pages move into a `src/app/(site)/` route group that owns the public header and footer; the root layout keeps only `<html>`/`<body>`. URLs do not change. `/admin` gets its own layout (Thread C) with no public navigation. (Route-group move: coordinator.)
- `/admin/**` is `noindex, nofollow`, excluded from the sitemap and disallowed in `robots.txt`, rendered dynamically, never cached publicly.
- Every `/admin` page checks the session and permission on the server itself. The Next.js proxy (`src/proxy.ts`, Next.js 16's name for middleware) only refreshes the session cookie and redirects obviously anonymous requests; it is never the only check.

## 2. Authentication (Thread A)

- Supabase Auth, email and password, with cookie sessions through `@supabase/ssr` (pinned by the coordinator). No other auth provider.
- **No public signup.** Signups are disabled in `supabase/config.toml` and must be disabled in the Supabase dashboard. Admin users are created by invitation (dashboard "Invite user") and then given an admin identity by an administrator.
- Server code always verifies the user with the Auth server (`auth.getUser()`), never trusts `getSession()` alone or any cookie content.
- Logout clears the session (server action, POST). Session expiry follows Supabase JWT expiry and refresh-token rotation; an expired or revoked session is treated as anonymous.
- The browser only ever holds the public URL and anon key. `SUPABASE_SERVICE_ROLE_KEY` is never used for admin requests (see §5).

## 3. Identity (Thread A, migration `0006_admin_identity.sql`)

- `public.admin_identities`: `id uuid primary key` whose value **is** the Supabase Auth user id (JWT `sub`), `display_name`, `status` (`active` | `disabled`), `disabled_at`, `disabled_reason`, `metadata jsonb`, `created_at`, `updated_at`. Email is never an identity. No foreign key to `auth.users`, so deleting an Auth user never deletes or rewrites history. Other tables reference it as `admin_id uuid references public.admin_identities (id)` with no cascade.
- Rows are never deleted (disable instead); `id` is immutable. The table is audited, has RLS on, no `anon` grants; `authenticated` may read only its own row. Writes go through `nfai_admin_*` identity functions (`manage_admins`), except the owner's SQL bootstrap of the first administrator (§9).
- **Actor ids in `publication_events`, `audit_log`, `provenance_links.created_by` and `supersessions.decided_by` are Auth user ids** (as in Phase 2, from the JWT `sub`), which equal `admin_identities.id`. A disabled or deleted user's history keeps its actor id.
- TypeScript (`server-only`): `@/lib/auth/server` exports `getAdminSession()`, `getAdminAccess()` (`allowed` | `unauthenticated` | `identity_missing` | `identity_disabled` | `unavailable`), `requireAdmin()`, `getAdminDatabaseClient()` (a client carrying the admin's own JWT, role `authenticated`); `@/lib/auth/actions` exports `signOutAction()`; route constants in `@/lib/auth/routes`. `AdminActor` is `{ authUserId, displayName }`.
- Session cookies: `@supabase/ssr`, cookie name `nfai-admin-auth`, path `/admin`, httpOnly, `SameSite=Lax`, `Secure` in production, 8-hour sliding idle lifetime. The absolute session lifetime follows Supabase Auth session settings (time-boxed sessions are a paid-plan feature). Sign-in rate limiting is Supabase Auth's built-in limit; there is no MFA in Phase 3.
- The proxy is `src/proxy.ts` (Next.js 16 renamed `middleware.ts` to `proxy.ts`).

## 4. Roles and permissions (Thread B, migration `0007_admin_roles_workflow.sql`)

Permissions are what the code checks; roles are bundles. A person may hold several roles. Assignments are append-only with revocation history, never deleted. Status and assignments are re-read on every call, so disabling a person or revoking a role applies to their next request.

| Permission | viewer | editor | reviewer | publisher | administrator |
|---|---|---|---|---|---|
| `view_admin` (enter `/admin`, read records, queues, provenance) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `edit_draft` (create and edit drafts, delete never-reviewed drafts, create sources and documents, attach and revoke provenance) | | ✓ | | | |
| `submit_review` (submit a draft for review, recall it) | | ✓ | | | |
| `validate_fact` (submitted draft or extracted → validated; send back to draft) | | | ✓ | | |
| `reject_fact` (→ rejected, with reason) | | | ✓ | ✓ | |
| `publish_fact` (validated → published) | | | | ✓ | |
| `supersede_fact` (correct a published record by publishing a replacement) | | | | ✓ | |
| `withdraw_fact` (published → withdrawn, with reason) | | | | ✓ | |
| `view_audit` (audit log and publication events) | | | ✓ | ✓ | ✓ |
| `manage_admins` (create and disable identities, grant and revoke roles) | | | | | ✓ |

The administrator role manages access and does not publish; a person who needs both holds both roles. Nobody can change their own roles or status. The first administrator is bootstrapped by the owner with SQL (§9).

## 5. Mutation path (Threads B and D)

**One mutation = one call to one trusted SQL function, made with the signed-in user's JWT as `authenticated`.**

- Server actions / route handlers (Thread D, `src/lib/admin/mutations`) get a client carrying the admin's own JWT from `getAdminDatabaseClient()` (Thread A), validate input, and call `rpc('nfai_admin_…')`. They never send an actor id, role or target state; the function derives the actor from `auth.uid()`.
- The `nfai_admin_*` functions (Thread B; identity functions Thread A) are `SECURITY DEFINER`, `set search_path = ''`, `EXECUTE` granted to `authenticated` only (never `public` or `anon`). Each one resolves the caller's identity from `auth.uid()`, refuses unknown or disabled identities, checks the permission, validates arguments, sets `nfai.actor_id` = `auth.uid()`, `nfai.actor_kind` = `user` and `nfai.actor_label` (overwriting anything the caller set), then calls the Phase 2 primitives (`nfai_transition`, `nfai_supersede`, `nfai_withdraw`) or writes the allow-listed table with a per-table column allow-list (`id`, `publication_state`, timestamps and actor columns are never accepted). Phase 2 triggers still enforce lifecycle, frozen content and provenance.
- A browser calling these functions directly with its own token gets exactly the same checks; no path trusts client-supplied identity, role or state.
- `nfai_security_audit()` is replaced in 0007 (`create or replace`, keeping every Phase 2 check) with an explicit allow-list for the `nfai_admin_*` definer functions (authenticated EXECUTE, never anon) and a check that every registered fact table has an approval policy.
- **service_role cannot review or publish.** A guard trigger (0007) on every registered fact table allows `publication_state` changes other than `draft ↔ extracted` only inside the workflow functions or as the migration owner. service_role calling `nfai_transition`, `nfai_withdraw` or `nfai_supersede` directly is refused. service_role can still insert drafts and extracted rows (future ingestion, Phase 12). The service-role client is not used by any admin mutation.
- Admin reads (review queue, record state, provenance, audit, action availability) go through `SECURITY DEFINER` read functions granted to `authenticated` that check `view_admin` / `view_audit` (Thread B), wrapped by `src/lib/admin/queries` (Thread D).

Error codes raised by the functions: `NFA01` not an admin, `NFA02` disabled, `NFA03` missing permission, `NFA04` separation of duties, `NFA05` workflow precondition; Phase 2 codes are kept (`23514` missing provenance or lifecycle violation). Thread D maps these to a small set of user-facing messages; raw database messages, SQL, stack traces and keys never reach the browser.

The admin API: the only functions `authenticated` may execute beyond the Phase 2 visibility helpers. `nfai_security_audit()` reports any other.

| Function | Permission |
|---|---|
| `nfai_admin_create_identity(uuid, text, text, jsonb)`, `nfai_admin_set_identity_status(uuid, text, text)`, `nfai_admin_set_identity_display_name(uuid, text, text)` (0006) | `manage_admins`; never on oneself |
| `nfai_admin_grant_role(uuid, text, text)`, `nfai_admin_revoke_role(uuid, text)` | `manage_admins`; never on oneself |
| `nfai_admin_create_draft(text, jsonb)`, `nfai_admin_update_draft(text, uuid, jsonb)`, `nfai_admin_delete_draft(text, uuid, text)` | `edit_draft`; update refused while submitted; delete only never-reviewed rows |
| `nfai_admin_create_source(jsonb)`, `nfai_admin_create_source_document(jsonb)`, `nfai_admin_record_observation(jsonb)`, `nfai_admin_attach_provenance(jsonb)`, `nfai_admin_revoke_provenance(uuid, text)` | `edit_draft` |
| `nfai_admin_set_source_status(uuid, text, text)` | `publish_fact`; proposed → approved or retired, approved → retired; reason required |
| `nfai_admin_submit(text, uuid, text)`, `nfai_admin_recall_submission(text, uuid, text)` | `submit_review` |
| `nfai_admin_validate(text, uuid, text)`, `nfai_admin_return_to_draft(text, uuid, text)` | `validate_fact` |
| `nfai_admin_reject(text, uuid, text, text)` | `reject_fact` |
| `nfai_admin_publish(text, uuid, text)` | `publish_fact` + §6 |
| `nfai_admin_supersede(text, uuid, uuid, text, text)` | `supersede_fact` + `publish_fact` + §6 for the replacement |
| `nfai_admin_withdraw(text, uuid, text, text)` | `withdraw_fact` |
| `nfai_admin_close_period(text, uuid, timestamptz, text)` | `publish_fact`; sets `valid_to` once on a published effective-dated row; reason required |
| `nfai_admin_whoami()`, `nfai_admin_review_queue(integer)`, `nfai_admin_record_status(text, uuid)`, `nfai_admin_get_record(text, uuid)`, `nfai_admin_list_records(text, text[], integer, integer)`, `nfai_admin_provenance(text, uuid)` | `view_admin` |
| `nfai_admin_record_history(text, uuid)`, `nfai_admin_audit_log(text, uuid, uuid, timestamptz, timestamptz, bigint, integer)` | `view_audit` |
| `nfai_admin_list_admins()`, `nfai_admin_role_history(uuid)` | `manage_admins` |

TypeScript mirrors of the vocabulary (permissions, roles, approval classes, actions, error classification) live in `src/lib/admin/permissions` and `src/lib/admin/workflow`; database tests fail if they drift from 0007. A fact table without a `fact_approval_policies` row is treated as separated.

## 6. Approval model (D-031)

"Submit for review" does not add a publication state. A submit action in the append-only `workflow_actions` table (0007) marks a draft as submitted; while submitted it cannot be edited; a recall or return to draft reopens it. `extracted` rows count as submitted. The lifecycle stays the Phase 2 seven states:

- validate: submitted draft or extracted → validated
- publish: validated → published
- reject: submitted draft, extracted or validated → rejected (reason required)
- return to draft: validated → draft, or cancel a submission (reason required)
- supersede, withdraw: published only (reason required)

Each registered fact table has an approval class in `fact_approval_policies`:

- **standard**: one person with the right permissions may validate and publish, including a draft they wrote. Every step is attributed.
- **separated** (high impact): the publisher must be a different person from (a) whoever validated the current review cycle and (b) anyone who created or edited the row's content (from `audit_log`). At least two people are involved and nobody satisfies both approvals. Applies to publish and to the replacement published by supersede. Withdrawal needs one publisher and a reason (removing a fact from the current record is the safe direction).

| Class | Tables |
|---|---|
| separated | `benchmark_results`, `pricing_records`, `model_capabilities`, `evaluation_configurations`, `benchmark_metrics`, `benchmark_versions` |
| standard | `providers`, `deployment_channels`, `model_families`, `model_versions`, `model_version_aliases`, `model_releases`, `capabilities`, `benchmarks`, `evaluation_harnesses`, `evaluation_harness_versions` |

Changing a class is a data row in a new migration and a recorded decision. A fact table registered later must get a policy in the same migration (`nfai_security_audit()` reports it otherwise). With a single qualified person, separated records cannot be published until a second one exists; this is intended.

The D-028 provenance gate is unchanged: no T4-only override in Phase 3.


## 7. Admin routes (Thread C)

`/admin` (dashboard), `/admin/review`, `/admin/models`, `/admin/benchmarks`, `/admin/pricing`, `/admin/sources`, `/admin/audit`, plus identity management under `/admin/access`. Auth screens (`/admin/auth/**`) belong to Thread A. Buttons reflect permission-aware action availability from Thread D's queries, but the server re-checks everything.

## 8. Tests

Authorization invariants are tested in the database (PGlite, `*.db.test.ts` / `*.admin.test.ts`) by calling the functions as `authenticated` with JWT claims for synthetic identities. The shim provides `auth.uid()` from `request.jwt.claims`. Synthetic identities use obviously fake names and fixed test UUIDs.

## 9. Remote setup and validation (owner only)

Agents never link, migrate or write to a remote Supabase project. These steps are for the owner, on the development project **NFAI Labs Dev** (ref `teaohntkuuqrenqfjmqh`), with synthetic test identities only. Nothing here is destructive: `0006` and `0007` only add tables, functions, grants and triggers; no Phase 2 object or row is changed or removed.

1. **Disable public signups.** Dashboard → Authentication → Sign In / Providers: turn off "Allow new users to sign up". Keep the Email provider enabled. Under URL Configuration, the Site URL can stay `http://localhost:3000` for local testing.
2. **Preview the migrations.** From the repository root (the project is already linked from Phase 2):
   ```bash
   npx supabase@2.118.0 db push --dry-run
   ```
   It must list exactly `0006_admin_identity.sql` and `0007_admin_roles_workflow.sql`.
3. **Apply them** (without the seed; it was applied in Phase 2):
   ```bash
   npx supabase@2.118.0 db push
   ```
4. **Database checks.** In the SQL Editor, run `supabase/validation/remote_checks.sql`. Every row must read `PASS`: 36 tables, RLS everywhere, an empty security audit, and the Phase 3 checks (service_role cannot validate or publish; anon cannot call admin functions; a signed-in user without an identity is refused; service_role cannot create identities; a standard record goes through the full workflow attributed to the admin; the same admin cannot validate and publish a separated record; a second admin can). The Phase 3 checks use synthetic identities inside a rolled-back transaction.
5. **Create a synthetic test admin.** Authentication → Users → Add user → Create new user, with an email address you control used only for testing, a strong password, and "Auto Confirm User" on. Copy the new user's UID. Then in the SQL Editor (it runs as the database owner, the only way to bootstrap the first administrator):
   ```sql
   insert into public.admin_identities (id, display_name)
   values ('<user-uid>', 'Test Admin (synthetic)');
   insert into public.admin_role_assignments (admin_id, role_code, grant_reason)
   select '<user-uid>', r, 'Phase 3 remote validation (synthetic test admin)'
     from unnest(array['administrator', 'editor', 'reviewer', 'publisher']) r;
   ```
   Also create a second Auth user with no identity row, to confirm that signing in alone grants nothing.
6. **Admin UI checks.** `.env.local` needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (admin never uses the service-role key). Then:
   ```bash
   npm run build
   ```
   ```bash
   npm run start
   ```
   In the browser: `/admin` while signed out redirects to sign-in; the second user (no identity) lands on the unauthorized page; the test admin reaches `/admin` and the review, models, benchmarks, pricing, sources and audit pages, can create a synthetic draft provider, attach a source document from the Phase 2 seed, submit, validate and publish it, and sees those actions on the audit page; signing out returns to sign-in and `/admin` is refused again.
7. **API checks.** Re-run the Phase 2 HTTP checks; they must still pass:
   ```bash
   node --env-file=.env.local supabase/validation/api_checks.mjs
   ```
8. Share the outputs of steps 2, 4, 6 and 7 so they can be recorded in `PHASES.md`. Afterwards, disable the test identities (identities are never deleted, by design). Synthetic records published in step 6 remain as history on the development project only.
