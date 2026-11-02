# RTG provider adapter and approval plan

## Current capability

Uber Eats and Deliveroo adapters provide local fixtures only. A fixture is fictional data supplied by RTG, not an official provider sandbox connection. Live fetch, acceptance/update and evidence-submission operations must reject regardless of supplied credentials or mode flags. No unofficial scraping, tablet automation, shared merchant passwords or reverse-engineered endpoints are used.

RTG's intended role is a secondary evidence and restaurant-support workflow. Whether that can coexist with an existing tablet/POS integration is an approval dependency, not an assumed provider capability. Do not claim read-only access exists until the partner confirms the available product and scopes.

## Adapter boundary

The provider boundary separates capability/status reporting, authorization lifecycle, store mapping, normalized order ingestion, webhook verification and evidence/export support. Sandbox methods may return deterministic fixtures. Planned live methods remain blocked. Disconnecting a connection must revoke ingestion and stop scheduled work; a local disconnect cannot revoke a real token that was never issued.

A normalized order retains full provider order ID, display reference, provider store ID and mapped local location, provider timestamps and server receipt time. The provider order ID is unique within the mapped organisation/location/provider. Unknown stores are quarantined rather than guessed. Duplicate event IDs with identical digests may be acknowledged; different bytes under one ID must be rejected and investigated.

## Partner questions

| Topic | Uber Eats question/gate | Deliveroo question/gate |
| --- | --- | --- |
| Product approval | Is a read-only/secondary evidence-support integration available for this use case, with which scopes and written approval? | Is a read-only/secondary evidence-support integration available and approved for these merchants? |
| Acceptance control | Does approved order access mandate acceptance, acknowledgment or full order-management responsibility? If yes, stop until that responsibility is explicitly designed, approved and tested. | Which tablet/POS/order-manager modes apply, and does integration change automatic acceptance or existing tablet behavior? |
| Coexistence | Can the merchant keep its current tablet/POS as the order system of record without conflicting control? | Can the tablet remain active, and what happens in tablet, POS or integrated order-management modes? |
| Identity and mapping | How are merchant/store IDs authorized and mapped? Can approval be per location? | Which site/store identifiers and per-location authorization are required? |
| Events and timestamps | Which official events are available? What signature, replay, retry and ordering rules apply? | Which approved webhook events, signature method, retry behavior and reconciliation endpoints apply? |
| Evidence and disputes | Is evidence submission available through an approved API? Which file formats, windows and fields are supported? | Is dispute/evidence submission permitted via API or only an official merchant workflow? |
| Retention and limits | What storage, deletion, rate-limit and support obligations apply? | What data-retention, rate-limit, deletion and partner-support obligations apply? |
| Test and rollout | Which official test environment, test stores and certification steps are required? | Which official test environments and tablet-mode certification tests are required? |

These are unresolved questions, not statements of current provider behavior. Consult the current official partner documentation and partner contact after access is approved. The application must not silently accept or acknowledge an order because a fixture API uses a similar name.

## Implemented local fixture inbox

`lib/webhooks.ts` records fixture events in `.data/webhook-inbox.json` before processing. Duplicate-safe normalization is scoped by tenant/location/provider/event ID. Failures record exponential backoff; the fifth failed attempt enters `DEAD_LETTER`. Admins/managers may list the inbox and explicitly invoke due retries. No autonomous worker or Redis connection exists. The optional `X-RTG-Sandbox-Signature` HMAC is a local test check and does not implement either provider signature scheme or a replay window.

Only fixture `order.created` is implemented. Cancellation processing, out-of-order reconciliation and real provider event mapping are not implemented. Both live webhook routes always return 503, including when a caller supplies a signature or credentials. See [workers/README.md](workers/README.md) for the production queue plan.

## Future ingress and worker flow

1. Terminate only the approved public webhook route. Bound request size; capture raw bytes without logging them.
2. Verify the provider-specific signature and replay/timestamp constraints using approved credentials; fail closed before normalization.
3. Resolve the connection and mapped location server-side. Insert a durable `WebhookInbox` record with provider event ID, digest, mode and receipt time.
4. A durable worker claims the inbox record, normalizes approved fields and writes order/event/audit changes transactionally. Store a private raw payload only when needed and permitted by retention policy.
5. Retry transient errors with bounded backoff; record a non-sensitive failure code and dead-letter exhausted work. Reconciliation jobs use cursors and approved limits.
6. Test disconnect/revocation, duplicate events, out-of-order events, unknown stores, stale signatures and worker crashes. Every live action must have a documented approval, idempotency rule and owner.

The local sandbox ingestion route is authenticated and fixture-only; it must not be advertised as the official provider callback URL. Do not point a production provider at this sandbox.

## Approval dependencies

Official provider access, merchant/location authorization and required scopes must be approved before implementing live calls. The user must explicitly approve production enablement and any paid services. Prepare a concrete reviewable integration, resource cost and test plan before asking for that final approval. Approval for one provider/store does not imply approval for another.
