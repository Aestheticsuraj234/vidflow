import type {VideoRepository} from '@vidflow/db';
import {
  completeUploadSchema,
  createUploadSchema,
  signPartsSchema,
  type CreateUploadResponse,
  type SignPartsResponse,
  type UploadStatusResponse,
  type VideoSummary,
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
      return c.json({videos: rows.map((v) => toVideoSummary(v, storage))});
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
      const res: VideoSummary = toVideoSummary(video, storage);
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
