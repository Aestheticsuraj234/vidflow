# Chapter 1: Architecture

Diagram: [system overview](architecture/system-overview.md)

```
apps/api/src     app.ts (createApp), auth.ts, env.ts, lib/, middleware/, routes/
apps/web/src     app/(auth), app/(app)/dashboard, components/ui, lib/auth-client.ts, proxy.ts
packages/shared  zod auth schemas, response types
packages/tsconfig strict base + node configs
```

Patterns: factory functions with injected dependencies (`createApp(deps)`),
an `AppError` hierarchy, and shared zod contracts between client and server.
