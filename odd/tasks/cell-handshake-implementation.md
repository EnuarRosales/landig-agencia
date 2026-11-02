# Cell Handshake Implementation
Implements the approved DAT-001/ADM-001/OPS-001 v1 cell handshake contract before production use.
Scope: no cell is deployed; v1 is remote VPS + local Docker Compose, private Router-to-cell connectivity, and protected cell APIs using Mocter AuthService/RBAC.

## Specs
- S1: “Responde siempres en spanish y continua con la implementacion”
- S2: “VPS + Compose local (Recomendado)”
- S3: “Acceso privado Router→celda (Recomendado)”
- S4: “API protegida en apps/web (Recomendado)”
- S5: Approved source of truth: `docs/specs/dat-001-arquitectura-datos-multiinquilino/requirements.md` RF-03.1, RF-03.8–RF-03.10; `design.md` §3.2, §3.3, §3.6.1–§3.6.4.
- S6: Approved admin and operations contracts: `docs/specs/adm-001-mocter-admin/requirements.md` RF-10.17–RF-10.19; `docs/specs/ops-001-operacion-continuidad-observabilidad/requirements.md` RF-06.7, RF-08.6, RF-09.1–RF-09.7 and acceptance criterion 15.
- S7: “Esto es una Rule para el proyecto. No realizar commit hasta que se pregunte cual el tag # a asignar para vincular dicho cambio al feature de github. El tag que se informe debe ir al principio del mensaje del commit.”

## Tasks
- T1 — S4-S6 — Route: gentle-ai-worker — Status: in progress — Commit: pending — Implement control-plane cell schema/migration, CSPRNG secret bundle encryption, draft registration and `cells.provision` authorization in `apps/web`; rewire the existing admin list/create UI through exact-origin CORS/CSRF and remove the unauthenticated legacy cell API path.
- T2 — S3,S5-S6 — Route: inline — Status: pending — Commit: pending — Implement private-target validation, dual DB/HTTP probes, activation/recovery transitions, and scheduled failure handling without automatic route moves.
- T3 — S4,S6 — Route: inline — Status: pending — Commit: pending — Implement admin cell modal/actions and manifest export through the protected `apps/web` API; use exact-origin CORS and CSRF.
- T4 — S2-S6 — Route: inline — Status: pending — Commit: pending — Implement the dedicated cell health service, canonical Compose stack and `pnpm cell:up`; migrations must complete before PgBouncer and the service start.
- T5 — S5-S6 — Route: inline — Status: pending — Commit: pending — Run applicable focused/domain/admin checks, validate compose configuration and cross-check the implemented contract; record any unavailable integration proof.

## Log
- L1: “Responde siempres en spanish y continua con la implementacion”
- L2: User approved v1 choices: “VPS + Compose local (Recomendado)”, “Acceso privado Router→celda (Recomendado)” and “API protegida en apps/web (Recomendado)”.
- L3: User confirmed no cell is deployed and OPS-001's prior `pg-cell-001` production references were stale.
- L4: Specification work is committed as `d2c8d2bb76c34fb2594b75142af7e50b6ba37cfd`; implementation must follow that commit's reviewed contracts.
- L5: Delivery strategy: keep each security/data/environment high-risk behavior in its own conventional work-unit commit; include tests with each behavior; do not push or create a PR.
- L6: “Esto es una Rule para el proyecto. No realizar commit hasta que se pregunte cual el tag # a asignar para vincular dicho cambio al feature de github. El tag que se informe debe ir al principio del mensaje del commit.”
- L6: User selected the existing Mocter AuthService/RBAC boundary; cell APIs will live on the `apps/web` auth origin, which receives the host-only session cookie on credentialed same-site requests from the admin subdomain.
- L7: T1 worker returned partial. Parent review found the cells GET route lacks `cells.provision` authorization, the RBAC role filter builds a malformed/non-matching `IN` query, the secret AAD is bound to `code` rather than the cell UUID, and creation does not validate required `app_url` or enforce derived `working_dir`/fixed `deploy_user`. These require RED tests and correction before T1 can close.
- L8: The worker's host-only-cookie blocker is not established: a credentialed request from the same-site admin subdomain to the cookie's own `apps/web` host can carry that host-only cookie. Keep exact-origin CORS/CSRF and verify the browser flow; do not broaden cookie Domain.
