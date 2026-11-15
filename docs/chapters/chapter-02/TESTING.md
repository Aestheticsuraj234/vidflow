# Chapter 2: Testing

| Package | Tests | Covers                                                                                                                                                                           |
| ------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| db      | 11    | state machine (2), create + ownership, legal/atomic transitions, late worker after cancel, rendition uniqueness and order, asset upsert + timeline, cascade delete; API keys (3) |
| api     | 7     | auth through Drizzle, health, 404                                                                                                                                                |
| shared  | 4     | unchanged                                                                                                                                                                        |

```
pnpm lint / typecheck / test / build  ✅  (22 tests)
pnpm smoke                            ✅
browser auth flow                     ✅ 7/7
```
