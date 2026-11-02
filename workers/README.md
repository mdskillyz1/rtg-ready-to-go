# RTG worker boundary

## Implemented local behavior

`lib/webhooks.ts` persists fixture inbox entries to `.data/webhook-inbox.json` before processing them. Entries record tenant/location, provider/event ID, receipt time, status, attempts and the next retry time. Processing is serialized inside the local application process and calls the duplicate-safe fixture normalizer. A failure becomes `RETRY`, with exponential backoff capped at one minute; the fifth failed attempt becomes `DEAD_LETTER`.

The authenticated admin/manager retry route runs due entries when invoked. There is **no autonomous poller or Redis/BullMQ consumer**. Pending/retry entries survive a restart when the same local data directory is retained; this is local filesystem persistence, not a multi-host durable queue or a database transaction across the inbox and order files. A fixed local webhook/session secret is needed when retaining signed sandbox state across restarts.

Only `order.created` fixture payloads are implemented. Provider cancellation handling, out-of-order event reconciliation and live event processing are not implemented. `/api/webhooks/uber` and `/api/webhooks/deliveroo` always return 503. The optional sandbox HMAC check is a local fixture test utility, not either provider's signature protocol.

## Proposed Redis/BullMQ production service

The target architecture is a separately deployed persistent Node.js worker using Redis/BullMQ, a PostgreSQL inbox/outbox and private durable object storage. This directory documents that boundary; it does not start a worker or provision Redis.

1. The approved webhook API verifies raw-body signatures/replay rules, resolves the provider store mapping and persists an inbox record transactionally. An outbox ensures that a crash between commit and queue publication cannot lose work.
2. A dispatcher publishes an opaque inbox ID as the job payload. Keep customer data, photos and provider credentials out of Redis job payloads and logs. Redis needs approved private connectivity, TLS/authentication, persistence and a documented recovery plan.
3. A worker resolves the authorized organisation/location, claims the inbox record and applies normalized order/event/audit changes in a database transaction. Database event IDs and payload digests remain the source of idempotency; queue job IDs alone are insufficient.
4. Configure bounded attempts and exponential backoff with jitter. Separate transient failures from invalid signatures, unmapped stores and permanent authorization failures. Retain exhausted jobs in a reviewable dead-letter path with redacted error codes.
5. Reconciliation, PDF export and retention run as distinct job types with separate permissions, resource limits and concurrency controls. Revalidate authorization and retention at execution time rather than trusting an old queued payload.
6. Handle worker shutdown, stale locks and job redelivery. Test process termination before/after database commit, Redis restart, duplicate/out-of-order events, disconnect/revocation and exhausted retries. An idempotent retry must not duplicate an order, export, billing usage or provider action.

Do not run a persistent BullMQ consumer inside a Vercel request handler or assume work continues after a request ends. Vercel's web application may enqueue approved work; a separate worker service owns persistent consumption. Select and approve that service and its costs before provisioning it. No worker platform or paid Redis instance has been created.

## Enablement gates

Production requires the PostgreSQL repository and migrations, real memberships, private object storage, an implemented inbox/outbox dispatcher, a reviewed Redis/BullMQ consumer, monitoring/alert ownership, backup/recovery and an approved deployment environment. Live provider jobs additionally require official provider/store approval, confirmed acceptance/tablet responsibilities and current signature/endpoint implementation. Explicit user approval is required for production enablement and paid resources.

References: [BullMQ workers](https://docs.bullmq.io/guide/workers), [retrying failed jobs](https://docs.bullmq.io/guide/retrying-failing-jobs). Consult the pinned library version's documentation during implementation.
