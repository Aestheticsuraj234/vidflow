# Chapter 1: Testing

```
pnpm lint / typecheck  ✅ 3/3
pnpm test              ✅ 11 tests (shared 4, api 7)
pnpm build && smoke    ✅
```

Browser (headless Chromium, production build): signed-out redirect, sign-up
field errors, sign-up → dashboard, sign-out, wrong password error, sign-in
with a lowercased email, signed-in redirect away from `/sign-in`: 7/7 ✅.
