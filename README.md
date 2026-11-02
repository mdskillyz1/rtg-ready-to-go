# RTG — Ready To Go

The working **local sandbox milestone** of the UK-focused restaurant order evidence platform, plus the Option B architecture and PostgreSQL design. This is a new Codex repository; no existing GitHub source was available here.

## Run

Node.js 22.13+ (CI uses Node 24).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://127.0.0.1:3000`. The production build uses Next.js’s supported Webpack compiler, and typechecking generates route types before checking a fresh checkout. Demonstration sessions are loopback-only. No account/platform credentials are needed. `RTG_MODE=production` or `VERCEL` fails closed for sandbox APIs.

| Route | Experience |
| --- | --- |
| `/` | Product, demo, pricing status, FAQ |
| `/console` | Manual orders, status, search/filters, evidence, activity, integrations |
| `/capture` | Mobile photos, previews, checklist, offline drafts and sync |
| `/admin` | Locations, role testing, browser-only retention preference, usage |
| `/internal` | Explicit support-access approval gate |
| `/privacy`, `/terms`, `/contact` | Development notices; operator/legal review required |

## Try it

1. Add a manual order with items in the console.
2. Open its row, select a packed/sealed/handover stage, choose a JPEG/PNG, review and save.
3. Download the PDF: identifiers, chronology, original images, hashes, actions and limitations. Bytes are hash-checked before export.
4. Switch location or Viewer role to test scope and write restrictions.
5. Load Staff capture online, choose an order, go offline and save a photo. The IndexedDB draft stays explicitly unsynced. Reconnect and sync this location; stable IDs prevent retry duplicates.

Use synthetic information. All seeded/imported provider orders are DEMO fixtures. No order is retrieved from Uber Eats or Deliveroo. Avoid customer/rider details and credentials.

## What runs and what remains

The demo uses single-process atomic JSON in `.data/`, restrictive local file permissions, signed sandbox cookies and private original photos. Browser drafts/cache hold synthetic order information. The Prisma schema is the **production design, not the running database**. No managed database, identity provider, S3, Redis consumer or Stripe account is connected. Sandbox role selection is not production identity verification.

Evidence and audits are immutable/append-only through the application; a machine owner can edit local files. The 30-day retention target is recorded, while automatic deletion, orphan cleanup, malware scanning, EXIF processing, subject rights, backup/restore, telemetry and alerts remain future work. Browser storage is not app-encrypted or guaranteed durable; unsynced drafts are not backups.

Local two-step uploads have a signed five-minute URL, one-use PUT, hash verification and idempotent completion. Signed reads still require a scoped session. These are local API URLs, not S3 presigned URLs.

The persisted fixture inbox has duplicate receipts, retry backoff and five-attempt dead letters. Admins/managers explicitly invoke due retries. It is not an autonomous Redis queue. Only `order.created` fixtures are supported. Cancellation/out-of-order reconciliation and official signatures await approved access. Live webhook and billing routes return disabled responses. The dispute-case route is an explicit scaffold; order PDFs work without submitting claims.

OCR review, authorised CSV import, billing/UK VAT, onboarding, production analytics, retention execution, MFA-ready auth, approved support access and observability are later milestones.

## Validate

```sh
npm run lint
npm run typecheck
npm test
DATABASE_URL=postgresql://rtg:rtg@127.0.0.1:5432/rtg_design npm run schema:validate
npm run build
npx playwright install chromium
npm run test:e2e
```

Prisma validation does not connect to a database. Tests cover scope/roles, sessions, images/hashes, exports, signed upload retries/expiry, duplicate fixtures, revocation and blocked live capabilities. Playwright covers order → photo → PDF, Viewer/location switching and offline sync. CI has no deployment step. See `VERIFICATION.md` for actual results.

Read [PLAN.md](PLAN.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_MODEL.md](DATA_MODEL.md), [API_INTEGRATIONS.md](API_INTEGRATIONS.md), [SECURITY.md](SECURITY.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [workers/README.md](workers/README.md).

Provider adapters prohibit live fetch/accept/cancel/fulfil/claim submission. Partner approval, secure credentials, merchant consent and validation are required before approved access. The user has authorised publishing this source to GitHub and the read-only UI to Vercel. A live production backend and paid resources remain separate approval gates.

If a synchronised Documents folder leaves source files marked dataless, extract the source archive into an unsynchronised development directory and run `npm ci` there. The demonstration preview in this Codex session runs from a clean temporary checkout.

## Hosted read-only preview

Open the [hosted demonstration](https://rtg-ready-to-go.vercel.app/console). Source: [mdskillyz1/rtg-ready-to-go](https://github.com/mdskillyz1/rtg-ready-to-go). The Vercel project is `rtg-ready-to-go` in the authorised `mdskillyz1s-projects` team. Deployment validation is recorded in `VERIFICATION.md`.

On Vercel, the server renders the console from deterministic public synthetic fixtures with a fixed Viewer role. Search, filtering, order details and fixture-location selection work. Hosted pages do not create a sandbox session, call the data APIs, register the capture service worker or store photo drafts. Uploads, status changes, manual orders, imports, exports and settings changes are disabled; `/capture` explains that the complete workflow remains local. All existing API guards still reject hosted data operations. This preview is not a production backend or live provider connection.
