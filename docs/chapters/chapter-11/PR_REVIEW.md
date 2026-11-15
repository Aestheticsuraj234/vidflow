# Chapter 11: Review

| #   | Finding                                                     | Fix                                 |
| --- | ----------------------------------------------------------- | ----------------------------------- |
| 1   | hls.js in the main bundle slows every page                  | Dynamic import inside the player    |
| 2   | Small players downloaded 1080p                              | `capLevelToPlayerSize`              |
| 3   | Preview tiles fetched one image per hover                   | One sprite, CSS background position |
| 4   | A leaked API key could add a webhook and siphon every video | Keys can't manage keys or webhooks  |
| 5   | `lastUsedAt` write slowed every API-key request             | Fire and forget                     |
| 6   | Bull Board reachable by any signed-in user                  | `ADMIN_EMAILS`, 404 otherwise       |
| 7   | Admin test collided with its own user on re-run             | Unique admin email per run          |
| 8   | Dashboard cards still said "chapter N"                      | All link to real pages              |
