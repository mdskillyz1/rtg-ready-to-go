# RTG deployment preparation

## Current state

This repository contains a local Next.js sandbox and a PostgreSQL/Prisma production data design. The running app uses JSON and private files beneath `.data/`, with a signed sandbox session. No official Uber Eats or Deliveroo connectivity is enabled. Production mode must fail closed until production authentication, database and storage adapters are implemented. Production deployment and paid resources require explicit approval.

Do not deploy the local filesystem repository as a working Vercel backend. Vercel does not provide a shared durable writable application directory. A successful build does not verify persistence, real identity, migrations, storage or provider access.

## Local setup and verification

Use the Node.js version required by `package.json` and the committed lockfile. From the repository root:

```sh
npm ci
npm run lint
npx next typegen
npm run typecheck
npm test
npm run schema:validate
npm run build
npx playwright install chromium
npm run test:e2e -- --project=chromium
npm run dev
```

Open the server's printed URL. The default script binds to `127.0.0.1`, keeping the sandbox local. Use fictional orders and test photos. Local `.data/` state, uploads, exports and secrets must remain untracked.

Schema validation needs a syntactically valid `DATABASE_URL`; a local placeholder is sufficient because validation does not connect to PostgreSQL. Playwright needs its Chromium installation and the configured loopback test server.

Read `.env.example` or `ENV.example` for supported sandbox settings. Set a random signing secret of at least 32 characters for stable sessions, without committing it. Never expose it as a `NEXT_PUBLIC_` variable. Retention defaults to 30 days; assigning an expiry timestamp does not itself delete local files.

The checked-in `.github/workflows/ci.yml` uses Node.js 24 and runs the locked install, lint, typecheck, Vitest, Prisma schema validation, Next.js build and Chromium Playwright checks on pushes/pull requests. It contains no deploy step or production credentials. Its schema URL and signing values are fictional CI configuration. The workflow itself is a scaffold until it runs in the authorized GitHub repository. See the [Playwright CI guide](https://playwright.dev/docs/ci-intro).

Record the exact checks that passed and any limits. A missing external service or unrun migration must not be reported as verified.

## GitHub preparation

Review the source and local commits before pushing. The destination repository must be selected and authorized by the user or organization; keep it private unless the intended audience is explicitly public.

```sh
git status --short
git log --oneline
git remote -v
```

Add the authorized destination as `origin` and push the reviewed branch through the connected account or normal credentials. Do not embed tokens in remote URLs. Do not publish `.env*`, `.data/`, uploads or generated evidence; the non-secret `.env.example` is the exception.

A pull request should describe the Option B first-milestone sandbox, its acceptance flow and test results, the PostgreSQL design and the remaining production gates. Do not claim provider connectivity or a production deployment.

## Local infrastructure limits

`lib/uploads.ts` supplies five-minute signed local upload URLs, one-use byte PUTs, idempotent completion and signed read links. Authentication and tenant/location scope are still required. These are local API URLs, not S3/object-store presigned URLs. Pending metadata/bytes are stored in `.data/pending`; expiry does not delete abandoned uploads. A tested cleanup executor is still required.

`lib/webhooks.ts` persists fixture entries in `.data/webhook-inbox.json`, including attempts, backoff and dead-letter status. Admins/managers invoke due retries explicitly; no autonomous Redis/BullMQ consumer is running. Inbox state survives a process restart with retained local files but is not transactionally committed with the separate order state or shared across instances. Configure `RTG_SANDBOX_WEBHOOK_SECRET` only for repeatable local signature tests; the optional fixture HMAC is not a real provider protocol.

The live Uber Eats and Deliveroo webhook routes always return 503. Provider cancellation processing and out-of-order reconciliation are not implemented. The separate production worker design is in [../workers/README.md](../workers/README.md). Do not run a persistent queue consumer in a Vercel request handler or depend on work continuing after the request ends.

## Production implementation gates

1. Review the supplied Option B requirements against `PLAN.md` and distinguish implemented behavior from future design artifacts.
2. Replace demo sessions with a real identity provider and protected membership/location provisioning, revocation and session lifecycle.
3. Implement the scoped PostgreSQL repository, reviewed migrations, database constraints, transactional audit/idempotency changes and concurrency checks.
4. Replace local files with private durable object storage. Verify byte validation, SHA-256, authorized reads, retention and backup/restore.
5. Implement the approved Redis/BullMQ worker service and PostgreSQL inbox/outbox for inbox processing, synchronization, exports and retention. Test retries, failures and replay handling.
6. Confirm evidence and audit retention, deletion and dispute hold rules; run a retention dry run before enabling deletion.
7. Obtain official provider/store approval and approved scopes. Resolve Uber order-acceptance obligations and Deliveroo tablet/order-manager behavior before live enablement. Implement current signature/replay verification and approved endpoints only.
8. Add redacted logs, monitoring, abuse limits, readiness checks, incident ownership and rollback procedures.

The production schema uses Prisma 6 syntax. Use the pinned CLI/client version; newer major releases may use a different contract format. Validate the schema and generate/review an initial migration against an isolated PostgreSQL instance. Add positive-quantity, nonnegative-money and retention constraints and protect append-only audit/event records. Use `prisma migrate deploy` for reviewed release migrations; do not use `db push` to mutate production.

## Vercel preview and release

Connect only the authorized GitHub repository and Vercel project after the production adapters exist, or after a separate deliberately read-only preview is prepared. Preserve deployment protection for internal review. A demo session endpoint is suitable only for fictional isolated data.

Configure the Next.js framework preset, correct repository root and the tested Node.js runtime. Install from the lockfile with `npm ci` and build with `npm run build`. PostgreSQL, private object storage and any queue/cache service must be provisioned separately after their costs and use are approved. Use isolated preview resources and environment-specific secrets.

Only configure variables read by implemented adapters. Naming a database, identity, storage or provider variable does not implement its connection. Keep secrets in the deployment secret manager, out of Git, `vercel.json`, browser bundles and logs. Provider credentials remain absent until approval. Apply migrations in a controlled step with a separately privileged database identity; runtime identities need least privilege and compatible database pooling.

Before releasing, verify the complete deployed path with isolated test data: sign in, resolve the authorized location, create an order, upload/read a photo, recheck its digest, generate a PDF and inspect the audit event. Attempt cross-tenant and insufficient-role access. Test concurrent writes, upload/PDF limits, cold starts and retention failures. Confirm all unapproved provider actions still reject. Retain a known-good deployment for rollback.

Obtain explicit production and paid-resource approval before provisioning or releasing. Record external resource IDs and URLs only after successful creation/deployment. No external repository, Vercel project, paid service or live provider connection is created by these instructions.
