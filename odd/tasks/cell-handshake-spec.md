# Declarative Cell Handshake Specification
Tracks the approved specification revision across DAT-001, ADM-001, and OPS-001 before implementation.
Scope: no cell is deployed; OPS-001 §3.1 production-cell references are stale. V1 targets remote VPS and local Docker Compose, with private Router-to-cell connectivity.

## Specs
- S1: “analiza los cambios del commit c6209f584de0578a6068b4e9223aa570ae7605ff se requiere tomar concepto sobre los especificado y emitir un concepto para avanzar o no con su implementacion”
- S2: “Aclaro no tengo celdas existentes por asegurar podemos avanzar a la revision y definicion de la especificacion para pasar a codificar”
- S3: “VPS + Compose local (Recomendado)”
- S4: “Acceso privado Router→celda (Recomendado)”

## Tasks
- T1 — S1-S2 — Route: inline — Status: done — Commit: pending — Define one canonical cell lifecycle and schema contract; account for the confirmed empty-cell starting state.
- T2 — S1,S3-S4 — Route: inline — Status: done — Commit: pending — Define the v1 deployment and private dual-handshake contract, including secret handling and failure behavior.
- T3 — S1-S4 — Route: inline — Status: in progress — Commit: pending — Correct stale OPS-001 production-cell claims in requirements, design, and task evidence; align ADM-001/OPS-001 with DAT-001 and verify cross-spec consistency.

## Log
- L1: “analiza los cambios del commit c6209f584de0578a6068b4e9223aa570ae7605ff se requiere tomar concepto sobre los especificado y emitir un concepto para avanzar o no con su implementacion”
- L2: “Aclaro no tengo celdas existentes por asegurar podemos avanzar a la revision y definicion de la especificacion para pasar a codificar”
- L3: User selected “VPS + Compose local (Recomendado)” and “Acceso privado Router→celda (Recomendado)” for v1.
- L4: Specification refinement: `cells.status` governs placement eligibility without mutating `client_routing`; all activations/re-activations require the full manual handshake; probes use a private allowlist and least-privilege healthcheck role; secret bundles are encrypted at rest; v1 uses remote/local Docker Compose and does not include Kubernetes.
- L5: Cross-spec review found `docs/specs/ops-001-operacion-continuidad-observabilidad/design.md` §3.1 (lines 65–70) describes an active production `pg-cell-001` and backup coverage, while the user clarified no cells exist to preserve; status must be reconciled before finalizing the starting-state statement.
- L6: User selected “No cell is deployed; OPS text is stale”.
- L7: Review found additional stale production-cell claims in OPS-001 `tasks.md` T-01 evidence and `requirements.md` RF-03.1/acceptance criterion 1; these must distinguish current instances from future cells.
- L8: Cross-spec verification passed: `git diff --check` and targeted Node assertions confirmed consistent cell states, v1 topologies, empty-cell starting state, and backup prerequisites. Documentation-only work; no runnable behavior tests apply.
- L9: The staged diff check found trailing whitespace in the S4 quote in this task file; it was removed, and the complete staged `git diff --cached --check` passed across all seven files.
