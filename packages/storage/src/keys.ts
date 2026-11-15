/**
 * Bucket layout. One place decides every key, so services never build paths
 * by hand and the private/public split cannot drift.
 *
 *   sources/{videoId}/original.{ext}        private: the upload
 *   work/{videoId}/{rendition}.mp4          private: encoded MP4s
 *   public/videos/{videoId}/                public, cacheable (CDN)
 *     master.m3u8
 *     {rendition}/index.m3u8, init.mp4, seg_00001.m4s …
 *     poster.jpg, thumbs/0001.jpg …, sprite.jpg, sprite.vtt
 */
export const keys = {
  source(videoId: string, extension: string): string {
    const ext = extension.replace(/^\./, '').toLowerCase() || 'bin';
    return `sources/${videoId}/original.${ext}`;
  },
  renditionMp4(videoId: string, rendition: string): string {
    return `work/${videoId}/${rendition}.mp4`;
  },
  publicRoot(videoId: string): string {
    return `public/videos/${videoId}/`;
  },
  master(videoId: string): string {
    return `public/videos/${videoId}/master.m3u8`;
  },
  renditionDir(videoId: string, rendition: string): string {
    return `public/videos/${videoId}/${rendition}/`;
  },
  poster(videoId: string): string {
    return `public/videos/${videoId}/poster.jpg`;
  },
  thumbnail(videoId: string, index: number): string {
    return `public/videos/${videoId}/thumbs/${String(index).padStart(4, '0')}.jpg`;
  },
  sprite(videoId: string): string {
    return `public/videos/${videoId}/sprite.jpg`;
  },
  spriteVtt(videoId: string): string {
    return `public/videos/${videoId}/sprite.vtt`;
  },
  /** Everything stored for a video, for deletion (Chapter 12). */
  allPrefixes(videoId: string): string[] {
    return [`sources/${videoId}/`, `work/${videoId}/`, `public/videos/${videoId}/`];
  },
};

/** Cache headers: segments never change; playlists may be rewritten. */
export const CACHE = {
  immutable: 'public, max-age=31536000, immutable',
  playlist: 'public, max-age=60',
  private: 'private, no-store',
} as const;
