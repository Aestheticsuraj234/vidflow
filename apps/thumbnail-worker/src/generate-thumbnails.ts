import {execFile} from 'node:child_process';
import {mkdir, mkdtemp, rm, stat, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {promisify} from 'node:util';

import type {VideoRepository} from '@vidflow/db';
import {
  planSprite,
  posterArgs,
  posterTimeSec,
  runFfmpeg,
  spriteArgs,
  spriteVtt,
} from '@vidflow/media';
import {UnrecoverableError, type JobData, type ThumbnailResult} from '@vidflow/queues';
import {CACHE, keys, type StorageProvider} from '@vidflow/storage';

const run = promisify(execFile);

export interface ThumbnailDeps {
  videos: VideoRepository;
  storage: StorageProvider;
  tmpDir: string;
}

async function imageSize(path: string): Promise<{width: number; height: number}> {
  const {stdout} = await run(process.env.FFPROBE_PATH ?? 'ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0',
    path,
  ]);
  const [width = 0, height = 0] = stdout.trim().split(',').map(Number);
  return {width, height};
}

/**
 * Thumbnail stage, alongside transcoding: a poster image, and a sprite sheet
 * with a WebVTT index for scrub previews. Not part of the flow, so a failure
 * here never blocks playback.
 */
export async function generateThumbnails(
  deps: ThumbnailDeps,
  {videoId}: JobData<'thumbnail'>,
): Promise<ThumbnailResult> {
  const {videos, storage} = deps;
  const video = await videos.findById(videoId);
  if (!video?.sourceKey) throw new UnrecoverableError(`Video ${videoId} not found`);
  if (video.status === 'canceled' || video.status === 'failed') {
    throw new UnrecoverableError(`Video is ${video.status}`);
  }
  const {durationMs, width, height} = video;
  if (!durationMs || !width || !height) throw new UnrecoverableError('Video has not been probed');

  await mkdir(deps.tmpDir, {recursive: true});
  const dir = await mkdtemp(join(deps.tmpDir, 'vidflow-thumbs-'));
  try {
    const input = await storage.presignGet(video.sourceKey, 3600);
    const posterPath = join(dir, 'poster.jpg');
    const spritePath = join(dir, 'sprite.jpg');
    const plan = planSprite(durationMs, width, height);

    // Two FFmpeg processes in parallel: the poster seeks, the sprite scans.
    await Promise.all([
      runFfmpeg(posterArgs(input, posterPath, posterTimeSec(durationMs))),
      runFfmpeg(spriteArgs(input, spritePath, plan, durationMs)),
    ]);
    const vtt = spriteVtt(plan, durationMs);
    await writeFile(join(dir, 'sprite.vtt'), vtt);

    const posterKey = keys.poster(videoId);
    const spriteKey = keys.sprite(videoId);
    const vttKey = keys.spriteVtt(videoId);
    const jpeg = {contentType: 'image/jpeg', cacheControl: CACHE.immutable};
    await Promise.all([
      storage.putFile(posterKey, posterPath, jpeg),
      storage.putFile(spriteKey, spritePath, jpeg),
      storage.put(vttKey, vtt, {contentType: 'text/vtt', cacheControl: CACHE.immutable}),
    ]);

    const [poster, sprite] = await Promise.all([imageSize(posterPath), imageSize(spritePath)]);
    const sizes = await Promise.all([stat(posterPath), stat(spritePath)]);
    await videos.upsertAsset({
      videoId,
      kind: 'poster',
      key: posterKey,
      contentType: 'image/jpeg',
      ...poster,
      sizeBytes: sizes[0].size,
    });
    await videos.upsertAsset({
      videoId,
      kind: 'sprite',
      key: spriteKey,
      contentType: 'image/jpeg',
      ...sprite,
      sizeBytes: sizes[1].size,
    });
    await videos.upsertAsset({
      videoId,
      kind: 'sprite_vtt',
      key: vttKey,
      contentType: 'text/vtt',
      sizeBytes: Buffer.byteLength(vtt),
    });
    await videos.addEvent(
      videoId,
      'thumbnail',
      `Poster ${poster.width}×${poster.height} and ${plan.count}-frame preview sprite (every ${plan.interval}s)`,
    );
    return {posterKey, spriteKey};
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}
