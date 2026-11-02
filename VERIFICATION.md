# RTG local sandbox verification

Verified on 2 November 2026 with Node.js 24.15.0 and the committed npm lockfile. This report covers the local synthetic-data milestone, not a production service or an approved provider integration.

| Check | Result |
| --- | --- |
| Locked dependency installation | Passed: `npm ci --offline`, 444 packages from the existing cache |
| Lint | Passed: `npm run lint`, no errors or warnings |
| TypeScript | Passed: `npm run typecheck`; route types generated before `tsc --noEmit` |
| Unit/integration tests | Passed: 18 tests across 2 Vitest suites |
| PostgreSQL schema design | Passed: Prisma 6.19 validation; no database connection or migration |
| Production build | Passed: Next.js 16.4.3 with the supported Webpack compiler |
| Browser flows | Passed: all 3 Chromium Playwright tests |
| Desktop/mobile screenshots | Saved and visually inspected: console, marketing site, staff capture |
| PDF download | Passed through the browser; original-byte hashes, image embedding and tamper rejection covered by integration tests |
| PDF visual layout | Passed: both exported pages rendered with bundled PDFium; no clipping or overlaps. The fixture image is a white 1×1 PNG, so realistic photo quality was not assessed. |

## Tested stories

1. Create a manual order, search for it, attach an original photo, download its PDF evidence bundle, and advance packing/ready status.
2. Switch location and sandbox role; Viewer cannot create orders. Repository tests reject unknown tenants and cross-location order/evidence access.
3. Select an order on mobile, go offline, save a visibly unsynced photo draft, reconnect and successfully sync it.

Other tests cover tampered/expired sessions, same-origin enforcement including Next.js internal-host canonicalisation, valid image bytes and size limits, immutable original digests, safe capture retries, two-step signed upload scoping/expiry, duplicate fixture delivery, revoked fixture connections, invalid sandbox signatures and disabled live capabilities.

Four added regressions exercise interrupted-upload recovery: identical staged bytes can complete after metadata persistence is interrupted; conflicting lengths or hashes cannot replace the original; completion can recover after an evidence record was attached but upload completion metadata was not saved.

## Build and environment notes

Turbopack's production CSS compiler could not bind its internal process port in this execution environment, including the elevated attempt. The build script therefore uses Next.js's supported `--webpack` option, which compiled, typechecked and prerendered all routes successfully. Development preview and browser tests used `next dev`.

Some files in the synchronised Documents directory were marked dataless and caused reads to stall. Verification ran from a clean temporary checkout with fresh local dependency files. The tested source was copied back atomically and packaged into a portable source archive and Git bundle. No runtime data, dependency directories, build output or real secrets are included in those archives.

## Limits and remaining gates

- Sessions and roles are for the local demonstration. Real identity, invitations, MFA and organisation provisioning remain future work.
- The running repository is JSON/local files; PostgreSQL/Prisma is a schema design. S3 encryption/versioning and real presigned object uploads, Redis consumers, backups, monitoring, retention execution and malware scanning are not connected.
- All provider data is explicitly DEMO. Only creation fixtures are implemented; live signature verification, cancellation/out-of-order processing and reconciliation await approved access and implementation.
- Receipt OCR, authorised CSV import, production billing/UK VAT, support-access approval workflows and complete privacy operations remain later milestones.
- Schema validation is not database-layer tenant isolation validation. Local tests do not establish production GDPR compliance, performance, accessibility conformance or camera speed targets.
- Nothing has been pushed, hosted or deployed. Production deployment and paid resources require explicit approval under the supplied specification.

See the architecture, security, integration and deployment documents for the production dependency and partner approval gates.
