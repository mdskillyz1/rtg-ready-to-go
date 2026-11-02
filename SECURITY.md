# RTG security design and threat model

## Sandbox boundary

The current app is a local fictional-data sandbox. Its signed HttpOnly cookie demonstrates role and location checks; the sandbox session endpoint can issue a demo session and is not production authentication. `RTG_MODE=sandbox` is required. Do not store real customer evidence or expose the sandbox as a production service.

Private local state and files remain under ignored `.data/`, outside `public/`, with restrictive creation permissions. The JSON store serializes mutations inside one process and writes via replacement. It provides neither a database transaction across files nor multi-process locking, replication, immutable storage or disaster recovery.

## Threats and controls

| Threat | Current boundary/control | Production requirement |
| --- | --- | --- |
| Cross-tenant or cross-location object access | Server resolves orders/evidence inside signed session scope; unknown objects reject. | Real memberships/location grants, scoped repository queries, composite FKs and isolation integration tests. |
| Role escalation | Cookie signature and server-side role checks; viewers cannot write. | Identity provider, protected membership administration, revocation and strong staff/session lifecycle. |
| Cookie/session tampering | HMAC-signed payload, expiry, HttpOnly cookie; configured secret must be sufficiently long. | Managed secret rotation, TLS/Secure cookie, CSRF/origin checks, production identity and least-privilege sessions. |
| Malicious uploads or path traversal | JPEG/PNG size/content parsing; random IDs and sanitized display filename; private server path. | Streamed upload limits, object-store policy, resource/decompression limits, scanning where appropriate and service-level abuse controls. |
| Upload/read token leakage or reuse | Five-minute scoped signed local URLs still require the session; byte PUT is one-use and completion uses a capture idempotency key. | Object-store presigning/authorized proxy, token/log redaction, abandoned upload cleanup and distributed replay protection. |
| Evidence changed after capture | SHA-256 on original bytes and verification before read/export; mismatch stops operation. | Protected original object versions, immutable capture metadata, restricted audit permissions and independent backup/verification. |
| Forged capture time or misleading photo | Device time is untrusted and separate from server receipt; hashes do not establish depicted facts. | Preserve provenance limits in exports and staff policy; do not imply cryptographic proof of scene/time. |
| Webhook replay, forgery or duplicate writes | Authenticated fixture-only route, optional local HMAC check and persisted duplicate/retry/dead-letter metadata; live routes always return 503. | Official raw-body signature/replay verification, inbox digest check, transaction/outbox and queue idempotency. |
| Provider control conflicts | All live actions blocked; no automatic acceptance. | Written scope/merchant approval and explicit acceptance/tablet-mode responsibility. |
| Excessive retention | Configurable expiry, default 30 days, recorded at capture. | Tested retention worker, audited deletion/retry, export/backups policy, dispute hold rules where required. Local expiry alone is not deletion. |
| Secret/customer data in logs | Keep credentials absent; use concise allowlisted audit details. | Redaction, log access/retention, secret manager, incident monitoring and no raw payload/image logging. |
| Concurrent writes/data loss | One-process serialized sandbox operations and atomic state replacement. | PostgreSQL transactions/version checks, durable queue, private durable storage, backup and restore tests. |

## Trust and access design

Treat browser input, device clocks, provider payloads and filenames as untrusted. Tenant and location access comes from server-side identity/membership, never a request body. Verify each selected order/asset rather than checking only that a user is signed in. Manual input labeled with a provider is still manual evidence.

Use least-privilege identities for runtime database, worker, object store and release migrations. Keep identity, database, storage and provider secrets in the deployment secret manager; never commit them or expose them through `NEXT_PUBLIC_` variables. Record approval references and credential handles, not tokens. Production schemas should restrict audit/event metadata updates and preserve immutable original capture metadata.

Avoid collecting customer contact details, courier personal data or device identifiers unless required for an approved purpose. Consent records are a design for recording policy actions, not a substitute for determining the appropriate processing basis. Confirm retention, access, deletion/export requests and incident responsibilities with the business before accepting real data.

## Verification and release gates

Tests must exercise missing/tampered/expired sessions, insufficient roles, cross-location/tenant requests, corrupt or oversized uploads, changed stored bytes, duplicate captures/events, provider live-mode rejection and unsupported production mode. Review dependencies and deploy only a tested source revision.

Production authentication, persistence, queue/worker, storage, retention execution and provider API approval are outstanding gates until independently implemented and tested. A source commit, passing build or hosted dashboard does not satisfy these gates. Explicit production and paid-resource approval remains required.
