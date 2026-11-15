import type {VideoRepository} from '@vidflow/db';
import {
  completeUploadSchema,
  createUploadSchema,
  signPartsSchema,
  type CreateUploadResponse,
  type SignPartsResponse,
  type UploadStatusResponse,
  type VideoDetail,
} from '@vidflow/shared';
import type {StorageProvider} from '@vidflow/storage';
import {Hono} from 'hono';

import type {AppEnv} from '../app-env';
import {NotFoundError, UnauthorizedError} from '../lib/errors';
import {parseBody} from '../lib/validate';
import {toVideoSummary} from '../lib/video-dto';
import {requireUser} from '../middleware/session';
import type {UploadService} from '../services/upload-service';

function userId(c: {get(key: 'user'): AppEnv['Variables']['user']}): string {
  const user = c.get('user');
  if (!user) throw new UnauthorizedError();
  return user.id;
}

/** `/v1/videos`: create videos and drive their direct-to-storage upload. */
export function videoRoutes(
  videos: VideoRepository,
  uploads: UploadService,
  storage: StorageProvider,
) {
  return new Hono<AppEnv>()
    .use(requireUser)
    .get('/', async (c) => {
      const rows = await videos.listByUser(userId(c));
      const posters = await videos.posterKeys(rows.map((v) => v.id));
      return c.json({videos: rows.map((v) => toVideoSummary(v, storage, posters.get(v.id)))});
    })
    .post('/', async (c) => {
      const body = await parseBody(c.req.raw, createUploadSchema);
      const {video, upload} = await uploads.create(userId(c), body);
      const res: CreateUploadResponse = {video: toVideoSummary(video, storage), upload};
      return c.json(res, 201);
    })
    .get('/:id', async (c) => {
      const video = await videos.findForUser(c.req.param('id'), userId(c));
      if (!video) throw new NotFoundError('Video not found');
      const [renditions, assets, events] = await Promise.all([
        videos.listRenditions(video.id),
        videos.listAssets(video.id),
        videos.listEvents(video.id),
      ]);
      const asset = (kind: string) => assets.find((a) => a.kind === kind)?.key;
      const vtt = asset('sprite_vtt');
      const res: VideoDetail = {
        ...toVideoSummary(video, storage, asset('poster')),
        fps: video.fps,
        videoCodec: video.videoCodec,
        hasAudio: video.hasAudio,
        renditions: renditions.map((r) => ({
          name: r.name,
          width: r.width,
          height: r.height,
          videoBitrateKbps: r.videoBitrateKbps,
          status: r.status,
          progress: r.progress,
          sizeBytes: r.sizeBytes,
          encodeMs: r.encodeMs,
        })),
        previewsUrl: vtt ? storage.publicUrl(vtt) : null,
        events: events.map((e) => ({
          stage: e.stage,
          message: e.message,
          createdAt: e.createdAt.toISOString(),
        })),
      };
      return c.json(res);
    })
    .get('/:id/upload', async (c) => {
      const res: UploadStatusResponse = await uploads.status(userId(c), c.req.param('id'));
      return c.json(res);
    })
    .post('/:id/upload/parts', async (c) => {
      const {partNumbers} = await parseBody(c.req.raw, signPartsSchema);
      const res: SignPartsResponse = await uploads.signParts(
        userId(c),
        c.req.param('id'),
        partNumbers,
      );
      return c.json(res);
    })
    .post('/:id/upload/complete', async (c) => {
      const body = await parseBody(c.req.raw, completeUploadSchema);
      const video = await uploads.complete(userId(c), c.req.param('id'), body);
      return c.json(toVideoSummary(video, storage));
    })
    .delete('/:id/upload', async (c) => {
      const video = await uploads.abort(userId(c), c.req.param('id'));
      return c.json(toVideoSummary(video, storage));
    });
}
