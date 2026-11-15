# Chapter 4: Review

| #   | Finding                                                     | Fix                                               |
| --- | ----------------------------------------------------------- | ------------------------------------------------- |
| 1   | Client could claim an upload is complete with parts missing | Require exactly `partCount` distinct parts        |
| 2   | Client could upload a different size than it declared       | `HEAD` after complete; mismatch deletes and fails |
| 3   | Presigned URLs could expire during a long upload            | Sign each part just before sending                |
| 4   | Resume trusted localStorage for which parts were done       | Ask storage with `ListParts`                      |
| 5   | Signing arbitrary part numbers                              | Reject numbers past `partCount`                   |
| 6   | `fetch` has no upload progress                              | XHR for part PUTs                                 |
| 7   | Header wrapped `Logo` (already a link) in another link      | Removed; nested `<a>` caused hydration error #418 |
| 8   | localStorage throws in some private modes                   | Wrapped; resume is best effort                    |

Not done yet: uploads with API keys (Chapter 11) and per-user rate limits (Chapter 12).
