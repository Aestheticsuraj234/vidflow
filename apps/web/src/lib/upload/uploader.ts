import type {
  CreateUploadResponse,
  SignPartsResponse,
  UploadSession,
  UploadStatusResponse,
  VideoSummary,
} from '@vidflow/shared';

/** What the uploader needs from the outside world; swapped for fakes in tests. */
export interface UploaderIO {
  call<T>(path: string, init?: RequestInit): Promise<T>;
  /** PUTs one part and resolves with its ETag. Reports bytes sent so far. */
  putPart(
    url: string,
    body: Blob,
    onProgress: (sent: number) => void,
    signal: AbortSignal,
  ): Promise<string>;
  store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  sleep(ms: number): Promise<void>;
}

export interface UploadProgress {
  videoId: string;
  sentBytes: number;
  totalBytes: number;
  partsDone: number;
  partCount: number;
  resumed: boolean;
}

export interface UploadOptions {
  title: string;
  concurrency?: number;
  retries?: number;
  onProgress?: (p: UploadProgress) => void;
  signal?: AbortSignal;
}

/** localStorage key for a file: the same file picked again resumes its upload. */
export function fingerprint(file: Pick<File, 'name' | 'size' | 'lastModified'>): string {
  return `vidflow:upload:${file.name}:${file.size}:${file.lastModified}`;
}

/**
 * Resumable multipart upload straight to object storage:
 * create (or find) the upload, ask which parts storage already has, sign and
 * PUT the rest a few at a time with retries, then complete.
 */
export async function uploadFile(
  file: File,
  io: UploaderIO,
  options: UploadOptions,
): Promise<VideoSummary> {
  const {concurrency = 4, retries = 4, onProgress, signal} = options;
  const key = fingerprint(file);

  let videoId: string | null = io.store.getItem(key);
  let session: UploadSession | null = null;
  const done = new Map<number, string>();
  let resumed = false;

  if (videoId) {
    try {
      const status = await io.call<UploadStatusResponse>(`/v1/videos/${videoId}/upload`);
      session = status.upload;
      for (const p of status.uploadedParts) done.set(p.partNumber, p.etag);
      resumed = true;
    } catch {
      // The upload finished, was canceled or expired: start over.
      io.store.removeItem(key);
      videoId = null;
    }
  }
  if (!videoId || !session) {
    const created = await io.call<CreateUploadResponse>('/v1/videos', {
      method: 'POST',
      body: JSON.stringify({
        title: options.title,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      }),
    });
    videoId = created.video.id;
    session = created.upload;
    io.store.setItem(key, videoId);
  }

  const {partSize, partCount} = session;
  const sizeOf = (n: number) => Math.min(partSize, file.size - (n - 1) * partSize);
  const inFlight = new Map<number, number>();
  const report = () => {
    let sent = 0;
    for (const n of done.keys()) sent += sizeOf(n);
    for (const bytes of inFlight.values()) sent += bytes;
    onProgress?.({
      videoId: videoId!,
      sentBytes: sent,
      totalBytes: file.size,
      partsDone: done.size,
      partCount,
      resumed,
    });
  };
  report();

  const queue = Array.from({length: partCount}, (_, i) => i + 1).filter((n) => !done.has(n));
  const controller = new AbortController();
  signal?.addEventListener('abort', () => controller.abort(signal.reason));

  async function sendPart(n: number) {
    const blob = file.slice((n - 1) * partSize, (n - 1) * partSize + sizeOf(n));
    for (let attempt = 0; ; attempt++) {
      try {
        // Sign right before sending, so a long upload never uses an expired URL.
        const {parts} = await io.call<SignPartsResponse>(`/v1/videos/${videoId}/upload/parts`, {
          method: 'POST',
          body: JSON.stringify({partNumbers: [n]}),
        });
        const url = parts[0]?.url;
        if (!url) throw new Error(`No URL for part ${n}`);
        const etag = await io.putPart(
          url,
          blob,
          (sent) => {
            inFlight.set(n, sent);
            report();
          },
          controller.signal,
        );
        inFlight.delete(n);
        done.set(n, etag);
        report();
        return;
      } catch (err) {
        inFlight.delete(n);
        if (controller.signal.aborted || attempt >= retries) throw err;
        await io.sleep(Math.min(30_000, 500 * 2 ** attempt));
      }
    }
  }

  async function worker() {
    while (queue.length > 0) {
      const n = queue.shift();
      if (n !== undefined) await sendPart(n);
    }
  }

  try {
    await Promise.all(Array.from({length: Math.min(concurrency, queue.length)}, worker));
  } catch (err) {
    controller.abort();
    throw err;
  }

  const video = await io.call<VideoSummary>(`/v1/videos/${videoId}/upload/complete`, {
    method: 'POST',
    body: JSON.stringify({
      parts: [...done].map(([partNumber, etag]) => ({partNumber, etag})),
    }),
  });
  io.store.removeItem(key);
  return video;
}
