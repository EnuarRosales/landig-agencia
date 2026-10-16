# @mocter/domain

Shared domain layer for the Mocter platform: Drizzle ORM schema for the `leads`
table, Zod input validation, and the shared PostgreSQL (18+) client.

## Public exports (`@mocter/domain`)

- `./schema` — Drizzle table `leads`, `type Lead`, `type NewLead`.
- `./validation` — `leadSchema` (Zod) and `type LeadInput = z.infer<typeof leadSchema>`.
- `./db` — `db` (Drizzle instance over `postgres` postgres-js client) and
  `insertLead(input: LeadInput): Promise<Lead>`.

Contract notes:

- `insertLead` performs **no validation**. Callers (e.g. Server Actions in
  `apps/web`) must parse with `leadSchema` first, which is why `LeadInput`
  guarantees a non-optional `message: string | null` (absent input is
  normalized to `null`).
- `@mocter/domain` hands the raw postgres-js client to Drizzle; that client
  connects lazily, so importing this package never opens a connection.

## Scripts

```sh
pnpm --filter @mocter/domain db:generate  # generate SQL migrations (offline, no live DB needed)
pnpm --filter @mocter/domain db:migrate   # apply migrations (needs DATABASE_URL)
pnpm --filter @mocter/domain test         # Vitest unit tests
pnpm --filter @mocter/domain build        # tsc --noEmit type check
```

## Configuration

- `drizzle.config.ts` — PostgreSQL dialect, schema `./src/schema.ts`, output
  `./drizzle`, credentials from `process.env.DATABASE_URL` with a
  `postgres://localhost:5432/mocter` fallback used only for offline tooling.
- Generated migration SQL lives in `./drizzle`.
