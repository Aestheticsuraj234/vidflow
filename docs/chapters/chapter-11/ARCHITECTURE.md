# Chapter 11: Architecture

- [Player](architecture/player.md): stream, quality, previews
- [Pages and data](architecture/pages.md): what each page loads and listens to

| Decision                         | Why                                                    |
| -------------------------------- | ------------------------------------------------------ |
| hls.js + native fallback         | MSE everywhere except iOS, which has HLS built in      |
| Custom controls                  | Native controls can't show previews or a quality menu  |
| Sprite + VTT previews            | One request, standard format                           |
| Live patches + milestone refetch | Smooth progress without polling, full data when needed |
| Keys can't manage keys/webhooks  | Limits what a leaked key can do                        |
| Bull Board 404 for non-admins    | Doesn't reveal that an admin page exists               |
