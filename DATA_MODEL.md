# RTG PostgreSQL data model

`prisma/schema.prisma` is the proposed PostgreSQL production schema, using Prisma 6 syntax and UUID primary keys. It is separate from the running sandbox JSON repository. No generated migration has been applied and no production database is connected.

## Entities

| Entity | Purpose and key constraints |
| --- | --- |
| Organisation | Tenant boundary and business account. |
| Location | Restaurant operating location, restaurant name and IANA time zone. Owned by one organisation. |
| User | Global identity-provider subject; organisation access is granted only through membership. |
| Membership, Role | Active organisation membership and versioned action permissions. `MembershipLocation` restricts location access. Role codes include OWNER, ADMIN, MANAGER, STAFF and VIEWER. |
| ProviderConnection | Provider, sandbox/live mode, status, explicit approval/scopes and secret-manager references. Credentials are not stored in plaintext. |
| ProviderStoreMapping | Maps an approved provider store to a local location. Provider identity must match the connection. |
| Order, OrderItem | Full `providerOrderId` separate from `shortReference`; integer money; provider creation time separate from server receipt; optimistic version. Provider IDs are unique per organisation/location/provider. Short references are searchable and are not global identifiers. |
| OrderEvent | Append-only normalized order/provider events with provider and server times and optional payload digest. |
| EvidenceCaptureSession | Groups captures for an order and records staff identity and session start/close times. |
| EvidenceAsset | Immutable capture metadata, original private object key/version, MIME/size, SHA-256, stage, seal ID, untrusted device time, trusted receipt time and expiry. |
| HandoverEvent | Explicit handover, seal/courier reference, actor and separate device/server timestamps. Avoid unnecessary courier personal data. |
| DisputeCase | Provider case reference, reason and lifecycle status linked to an order. No automatic provider submission is implied. |
| EvidenceExport | Immutable manifest and PDF/object digests, selected assets through `EvidenceExportAsset`, actor, optional dispute case and expiry. |
| WebhookInbox | Scoped external event identity, raw-body digest/private pointer, signature result, provider/receipt times and retry status. |
| SyncJob | Durable scheduled synchronization status, cursor, attempts and non-sensitive failure code. |
| AuditLog | Append-only actor/action/entity and allowlisted metadata using server time. |
| Subscription | Plan and billing references only; no card details or implemented payment flow. |
| UsageRecord | Metric and quantity with a per-organisation idempotency key. |
| ConsentRecord | Append-only grant/withdrawal record for a versioned purpose/policy. It is not evidence that a particular legal basis has been established. |
| RetentionPolicy | Organisation/location policy, version and configurable evidence/export days. Conservative defaults are 30 days; audit retention requires a separate documented decision. |

## Integrity and access

All organisation-owned records carry `organisationId`. References to a location, order, role, membership, connection, capture session or dispute use composite keys including that identifier. Capture sessions, dispute-linked exports and export asset selections also constrain the order. Per-order client capture IDs prevent repeated uploads from creating duplicate assets. Evidence IDs and object keys are random; user filenames never determine a storage path.

Database foreign keys stop inconsistent relationships, while request/worker authorization controls who may access them. Scope every repository query by organisation and authorized location. Never accept `organisationId`, a role or a provider store ID from the client as proof of access. Evaluate PostgreSQL RLS with the chosen pool/client; this schema does not configure it.

Generate reviewed migrations with positive-quantity, nonnegative-money and valid-retention checks. Grant the runtime identity INSERT/SELECT access to audit/events as appropriate and prevent UPDATE/DELETE of immutable capture metadata and audit rows. Retention deletion is a controlled lifecycle action with an appended event, not a metadata rewrite. Protect object versions and the audit trail independently of the application account where practical.

Process an order mutation, its audit event and corresponding event/idempotency transition in one database transaction. Treat webhook uniqueness collisions as an idempotent replay only after checking the payload digest; reject reuse of an event ID with different bytes. Use optimistic version checks or row locking for concurrent changes.

## Local-to-production mapping

The local `tenantId` corresponds to `organisationId`. Local restaurant/location fixtures demonstrate multi-location views. Local orders, photo metadata, audit events and fixture receipts are simplified representations; the other production entities are design artifacts, not populated application tables. Sandbox `createdAt` on evidence is the server receipt time, while `deviceCapturedAt` is separate. Retention timestamps alone do not erase local files.

Before migrating real data, finalize naming and provider field mapping, generate and review the initial migration, run schema validation and database integration tests, test tenant isolation and backup/restore, and reconcile any provider-specific identifiers with approved documentation. Pin the CLI/client major version; current latest Prisma releases may use a different contract format.
