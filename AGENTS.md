# Repository Agent Protocol

Fresh-session entrypoint: `docs/ROADMAP_MASTER.md`

Before implementation work, every Codex task must:

1. Read `docs/ROADMAP_MASTER.md` first.
2. Read `README.md` and the relevant product, architecture, security, API, UI, rule, and quality documents.
3. Verify `main`, `origin/main`, and a clean working tree before changing files.
4. Work only on the milestone marked `CURRENT` and the slice marked `NEXT` or explicitly approved.
5. Do not skip or parallelize top-level Roadmap milestones.
6. Update Roadmap status and evidence before integration.
7. Preserve Event Sourcing, append-only history, compensating corrections, server-authoritative state, and server-side RBAC.
8. Never invent official basketball or tournament rules; use `[NEEDS SOURCE]` when governing evidence is missing.
9. Do not expose private fields through public contracts, pages, DOM, sockets, or logs.
10. Stop after the approved slice and report the next safe step.

Additional safeguards:

- Treat `match_events` as append-only source of truth. Never update, delete, truncate, or rewrite historical events.
- Treat projections and snapshots as derived state only.
- Keep public clients read-only and sanitized. Protected REST and socket commands require server-side authentication, assignment checks, RBAC, validation, expected sequence enforcement, and idempotency.
- Do not add timer tick events. Derive running clocks from server-authoritative deadlines and synchronization data.
- Do not place secrets, machine credentials, production connection details, generated screenshots, or local browser data in the repository.
- Follow `docs/agent/AI_GIT_WORKFLOW_POLICY.md` before commit, merge, or push.
