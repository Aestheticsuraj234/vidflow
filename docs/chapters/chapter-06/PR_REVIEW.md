# Chapter 6: Review

| #   | Finding                                                   | Fix                                                        |
| --- | --------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | Phone videos came out landscape                           | Read display-matrix rotation, swap dimensions              |
| 2   | Corrupt uploads would retry 3 times                       | `ProbeError.invalidMedia` → `UnrecoverableError`           |
| 3   | A retry after a crash re-inserted renditions              | Unique (video, name), read back IDs                        |
| 4   | A crash between "processing" and starting the flow stalls | Re-run `startProcessing` when status is already processing |
| 5   | MP3 cover art counted as a video stream                   | Skip `attached_pic` streams                                |
| 6   | Odd dimensions break H.264 encoding                       | Round to even                                              |
| 7   | Parallel test packages raced to write the same fixture    | Write to a temp name, then rename                          |
| 8   | Bitrate above the source wastes bytes                     | Cap at 1.2× source bitrate                                 |
