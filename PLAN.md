# RTG Option B implementation plan

## Delivery boundary

The current milestone is the requested architecture, database design, UI routes and working manual-order evidence sandbox. Provider infrastructure stays in fixture mode until official approval. Production integrations, production deployment and paid resources require explicit approval; they are not unlocked by a configuration flag.

The original shared conversation is [Build RTG Platform](https://chatgpt.com/share/6ae28009-0b24-83eb-8da9-0d40b3871df0). The user subsequently supplied the Option B requirements in this Codex conversation. Reviewable repository changes are made locally before any external publication.

## Milestones

| Milestone | Deliverables | Acceptance gate |
| --- | --- | --- |
| 1 — local evidence workflow | Next.js dashboard and routes; manual orders; search; location scope; photo capture/upload; SHA-256; audit; PDF; fixture adapters; PostgreSQL design and architecture docs | Run lint, typecheck, Vitest, Prisma validation, build and Playwright; exercise create order → capture photo → verify bytes → export PDF in a browser. |
| 2 — production foundation | Real identity/memberships; PostgreSQL repository and reviewed migrations; private durable object storage; durable worker/queue; retention executor; monitoring and backups | Isolated service integration tests, tenant isolation checks, restore test and retention dry run. No live providers. |
| 3 — approved provider pilot | Approved partner credentials/scopes; store mapping; signed webhook inbox; idempotent normalizer; reconciliation jobs; clear tablet/order-management behavior | Written provider approval and user approval for the pilot; complete provider-specific test plan. |
| 4 — release | Authorized GitHub repository and Vercel project; environment configuration; preview verification; controlled release and rollback | Explicit production approval; no unapproved resource charges; verified production data path and support ownership. |

## Milestone 1 scope

- Build the restaurant dashboard, order detail/evidence flow, provider status and audit views.
- Demonstrate local manual orders, location isolation, role restrictions and append-only application audit events.
- Accept validated JPEG/PNG evidence through direct capture or a scoped five-minute local signed upload URL; complete uploads idempotently, retain original bytes privately, hash on receipt and recheck before download/export.
- Keep untrusted device timestamps separate from server receipt time; include seal and handover metadata where supplied.
- Preserve full provider order IDs independently of displayed short references and preserve provider/received timestamps.
- Exercise duplicate-safe sandbox fixture ingestion through a persisted JSON inbox. Failed entries record exponential backoff and become dead letters after five failed attempts; admins/managers explicitly invoke due retries. This is local single-process persistence, not Redis/BullMQ.
- Keep live webhook routes at 503 and all live fetch, acceptance and evidence-submission methods blocked. Provider cancellations and out-of-order event reconciliation are not implemented.
- Include GitHub Actions CI for lint, typecheck, Vitest, schema validation, build and Chromium Playwright checks, with no deployment step.
- Design every requested core entity in `prisma/schema.prisma`; document which records are currently represented only by the production design.

## Sequence and review

1. Inspect the workspace and recovered requirements; define scope and provider gates.
2. Establish Next.js foundation, domain types, scoped repository and session boundary.
3. Implement manual-order, evidence, export and sandbox integration routes.
4. Implement the UI and test the complete local workflow.
5. Validate the proposed schema separately from the local runtime, record test results and make reviewable local commits.
6. Hand off the runnable sandbox and the remaining approval/deployment dependencies.

Do not represent passing local tests as a successful database migration, production storage validation or provider connectivity test. Record any unavailable check in the handoff.

## Implemented infrastructure status

`lib/uploads.ts` implements a local two-step upload/finalize protocol: issue a signed scoped URL, PUT bounded bytes once, then validate and attach the evidence with an idempotent capture ID. Signed evidence reads expire after five minutes and still require the authenticated scoped session. These URLs target the local API; no object-store presigning is configured. Expired/orphaned pending uploads still need a cleanup executor.

`lib/webhooks.ts` persists fixture inbox entries and retry/dead-letter metadata. Due retries run on an explicit authenticated request; no autonomous consumer exists. The Redis/BullMQ production plan and deployment gates are in [workers/README.md](workers/README.md). Live provider signature verification, cancellation handling, ordering reconciliation and production queues remain future work.
