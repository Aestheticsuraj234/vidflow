# Chapter 1: Implementation notes

## Acceptance criteria

| #   | Criterion                                                      | Result |
| --- | -------------------------------------------------------------- | ------ |
| 1   | Sign up, sign in, sign out work in the browser                 | ✅     |
| 2   | Signed-out visitors are redirected to `/sign-in`               | ✅     |
| 3   | `/v1/me` returns the user with a session, 401 JSON without     | ✅     |
| 4   | `/health` reports the database and returns 503 when it is down | ✅     |
| 5   | The production API build starts (`pnpm smoke`)                 | ✅     |

## Decisions

- **Same foundation as Arena.** Proven monorepo, auth and design system, so
  the series can spend its time on video, not on setup.
- **Lessons carried over on day one:** the API bundle keeps third-party
  packages external (Arena's Chapter 2 crash), and peers are explicit
  (Arena's Chapter 12 image bloat).
- **Violet accent** to tell the two projects apart on screen.
