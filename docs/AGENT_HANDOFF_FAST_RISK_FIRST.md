# Agent Handoff: Fast Risk Reduction First, Refactor Second

Date: 2026-03-10
Repo: `el-inmortal-2-dashboard`
Execution mode: **Implement hotfixes first**, then refactor.

## Mission

Stabilize and secure production-critical paths **before** any large structural changes.
Work in small PRs with clear rollback points.

## Critical findings to address first (with evidence)

1. **Insecure secret fallbacks**
   - `src/app.js:51` uses fallback for `WEBHOOK_SECRET`.
   - `src/app.js:147` and `src/api/index.js:50` use hardcoded fallback for `SESSION_SECRET`.

2. **Plaintext password usage**
   - Login fallback compares plaintext in `src/routes/auth.js:39`.
   - Registration inserts plaintext password in `src/routes/auth.js:146` and `src/routes/auth.js:228`.

3. **Dynamic SQL interpolation risk**
   - Dynamic field update in `src/routes/api.js:207`.
   - Dynamic table access helpers in `src/routes/api-v1.js:316` and `src/routes/api-v1.js:321`.
   - Dynamic table update in `src/routes/uploads.js:451`.

4. **Command injection / unsafe shell composition**
   - ffmpeg command built from interpolated strings in `src/routes/api.js:25`.
   - ffmpeg/ffprobe command strings in `src/routes/tools.js:564`, `src/routes/tools.js:680`, `src/routes/tools.js:672`, `src/routes/tools.js:700`.
   - remotion render command composed as shell string in `src/routes/tools.js:872`.

5. **Config/deploy hygiene concerns**
   - Port/config mismatch across:
     - `src/app.js`
     - `Dockerfile`
     - `docker-compose.yml`
     - `render.yaml`
     - `ecosystem.config.js`
   - Sensitive comments/examples exist in deploy docs/config:
     - `render.yaml`
     - `docs/SETUP_DEPLOY.md`

---

## Delivery plan (strict order)

## PR 1 - Security Hotfix (blockers)

### 1) Secret hardening

**Files**
- `src/app.js`
- `src/api/index.js`
- (optional helper) `src/config/env.js`
- `.env.example`
- `README.md`

**Required changes**
- Remove insecure literal secret fallbacks.
- In production:
  - If `SESSION_SECRET` missing -> fail fast with clear startup error.
  - If `WEBHOOK_SECRET` missing -> disable deploy webhook route or return explicit 503 for that route.
- Keep local/dev usability with explicit, clearly marked dev behavior only (no production fallback secrets).

**Acceptance**
- No `SESSION_SECRET || '...'` remains in runtime entrypoints.
- No `WEBHOOK_SECRET || '...'` remains.

---

### 2) Password security migration (no plaintext writes)

**Files**
- `src/routes/auth.js`
- (new optional script) `scripts/migrate-password-hashes.js`
- docs update if script added

**Required changes**
- Stop writing plaintext passwords in all user creation paths.
- Login logic:
  - Primary path: bcrypt compare against `password_hash`.
  - Legacy transition path (if needed): if hash missing but legacy plaintext exists and matches, immediately:
    - generate bcrypt hash,
    - store hash,
    - clear plaintext password column (set `NULL` or empty by policy),
    - continue login.
- Remove ongoing plaintext dependency after migration path.
- Keep user-visible behavior stable (same login/register UX).

**Acceptance**
- New users are stored hash-only.
- Legacy plaintext users can still log in once and get auto-upgraded.
- No insert/update writes raw password values for `users.password` (except optional one-time migration handling to clear old values).

---

### 3) SQL injection surface reduction via strict allowlists

**Files**
- `src/routes/api.js`
- `src/routes/api-v1.js`
- `src/routes/uploads.js`

**Required changes**
- Replace interpolated SQL identifiers with fixed allowlist maps:
  - Track status field map in `api.js`.
  - Simple table map in `api-v1.js` (producers/composers/artists/splitsheets, etc.).
  - Avatar `type -> table` map in `uploads.js`.
- Never use user input directly as SQL table/column names.
- Keep query params as bound parameters for values.

**Acceptance**
- No direct `UPDATE ${...}`/`SELECT * FROM ${...}` where source is request-driven.
- Invalid table/field input returns `400` with clear error.

---

### 4) Command execution hardening (no shell string interpolation)

**Files**
- `src/routes/api.js`
- `src/routes/tools.js`
- (optional helper) `src/utils/processRunner.js`

**Required changes**
- Replace `exec()`/string-concatenated command execution for request-influenced inputs with `spawn`/`execFile` and args array.
- Validate/sanitize request-controlled command inputs:
  - `format` must be allowlisted (`png`, `jpg`, `jpeg`).
  - numeric fields (`time`) must be finite and bounded.
  - output filenames/paths must prevent traversal.
  - remotion `composition` should pass strict pattern validation.
- Keep timeouts in place.
- Preserve existing response shape as much as possible.

**Acceptance**
- No request-derived shell command string remains in these endpoints.
- Invalid command-related input is rejected with `400`, not executed.

---

### 5) Quick reliability fix in touched file

**File**
- `src/routes/uploads.js`

**Required change**
- Fix undefined `getAudioDuration` usage in audio replace flow (currently called but not properly imported in this file path).

**Acceptance**
- Replace-audio path does not throw `getAudioDuration is not defined`.

---

## PR 2 - Ops/Config consistency (safe follow-up)

### 1) Normalize runtime config intent

**Files**
- `Dockerfile`
- `docker-compose.yml`
- `render.yaml`
- `ecosystem.config.js`
- `README.md`

**Required changes**
- Make port behavior explicit and consistent by environment (no contradictory defaults in docs).
- Prefer `process.env.PORT` as source of truth for runtime.
- Document platform-specific expected port behavior clearly.

### 2) Remove sensitive example leakage in docs/config comments

**Files**
- `render.yaml`
- `docs/SETUP_DEPLOY.md`
- any other doc that includes live IP/secret-like examples

**Required changes**
- Remove password-like inline hints from comments.
- Replace with neutral placeholders and "set in provider secret manager" instructions.

---

## PR 3+ - Refactor phase (only after PR1+PR2 merged)

### Refactor A: Landing split
- Break `frontend/landing/landing.jsx` into modules:
  - UI sections/components
  - state/store/hooks
  - checkout/payment logic
  - media/playback utilities
- Keep behavior identical in first refactor pass (no UX redesign yet).

### Refactor B: CSS accessibility/interaction cleanup
- Review broad global interaction disables in `frontend/landing/landing.css`.
- Remove over-broad `user-select` / pointer restrictions that harm accessibility.
- Preserve intended branded interactions.

### Refactor C: Legacy DB script cleanup
- Mark SQLite-era scripts as deprecated or archive:
  - `src/utils/initDatabase.js`
  - `src/utils/seedDatabase.js`
  - `src/utils/updateSchema.js`
  - `src/utils/importAlbumData.js`
  - `src/utils/importAllData.js`
  - `src/utils/addComposersAndArtists.js`
- Align docs around current MySQL path in `src/config/database.js`.

---

## Execution rules for agent

- Keep PRs small and scoped exactly to sections above.
- Do not bundle refactors into security PR.
- Do not change user-facing flows unless required by security fix.
- Avoid destructive git operations.
- Preserve existing conventions and response payloads unless security requires change.
- Add short migration notes when behavior changes.

---

## Verification checklist (run per PR)

Because there is no formal test suite script, do this minimum set:

1. Syntax checks for touched JS files:
   - `node --check <file>`
2. Build landing assets:
   - `npm run landing:build`
3. Start app and verify health:
   - `npm start`
   - `GET /api/health` returns `200` JSON.
4. Security regression checks:
   - Confirm secrets are not hardcoded fallback literals.
   - Confirm auth inserts hash-only.
   - Confirm invalid field/table inputs are rejected.
   - Confirm command endpoints reject malformed `format/time/output` payloads without execution.

If possible, include one smoke test note per changed endpoint in PR description.

---

## Output expected from agent after each PR

Provide:

1. **What changed** (files + behavior)
2. **Why it reduces risk**
3. **How verified** (commands and endpoint checks)
4. **Any migration/operator action required**
5. **Rollback notes**

---

## Recommended PR sequence names

1. `security/remove-secret-fallbacks-auth-sql-cmd-hardening`
2. `ops/config-docs-consistency-and-secret-hygiene`
3. `refactor/landing-modularization-phase-1`
4. `refactor/landing-css-accessibility-cleanup`
5. `chore/deprecate-legacy-sqlite-scripts`
