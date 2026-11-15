# Chapter 1: Rebuild prompt

Create a Turborepo + pnpm monorepo "vidflow" (Node 22, TypeScript 6.0, ESLint
flat config, Prettier, `autoInstallPeers: false`). `packages/shared` with zod
sign-up/sign-in schemas (trim + lowercase email before validating).
`apps/api`: Hono, Better Auth (email/password, pg pool, basePath
`/api/auth`), `/health` (503 when the DB is down), `/v1/me`, `AppError` →
JSON, tsup that bundles only `@vidflow/*`. `apps/web`: Next.js 16, Tailwind 4,
dark theme with a violet accent, sign-up/sign-in form with per-field errors,
`proxy.ts` redirects, dashboard, sign-out. CI: format, lint, typecheck, test,
build, `pnpm smoke`.
