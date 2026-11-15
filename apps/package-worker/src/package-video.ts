import {mkdir, mkdtemp, readdir, rm} from 'node:fs/promises';
import {join} from 'node:path';

import type {Rendition, VideoRepository} from '@vidflow/db';
import {
  avcCodec,
  buildMasterPlaylist,
  hlsArgs,
  hlsContentType,
  mapLimit,
  measureBandwidth,
  probe,
  runFfmpeg,
  type Variant,
} from '@vidflow/media';
import {UnrecoverableError, type JobData, type PackageResult, type Pipeline} from '@vidflow/queues';
import {CACHE, keys, type StorageProvider} from '@vidflow/storage';

export interface PackageDeps {
  videos: VideoRepository;
  storage: StorageProvider;
  pipeline: Pipeline;
  tmpDir: string;
  keepRenditionMp4: boolean;
  segmentSeconds?: number;
}

const TMP_PREFIX = 'vidflow-package-';

/**
 * Package stage: the parent of the transcode flow. Runs once every rendition
 * is encoded, cuts each MP4 into fMP4 HLS (no re-encode), uploads segments
 * with cache headers, writes the master playlist and marks the video ready.
 */
export async function packageVideo(
  deps: PackageDeps,
  {videoId}: JobData<'package'>,
): Promise<PackageResult> {
  const {videos, storage} = deps;
  const video = await videos.findById(videoId);
  if (!video) throw new UnrecoverableError(`Video ${videoId} not found`);
  const masterKey = keys.master(videoId);
  if (video.status === 'ready') {
    // A retry after the video went ready: nothing left to do.
    const done = await videos.listRenditions(videoId);
    return {masterKey, renditions: done.map((r) => r.name)};
  }
  if (video.status !== 'processing') throw new UnrecoverableError(`Video is ${video.status}`);

  const renditions = await videos.listRenditions(videoId);
  const missing = renditions.filter(
    (r) => !r.mp4Key || (r.status !== 'transcoded' && r.status !== 'packaged'),
  );
  if (renditions.length === 0 || missing.length > 0) {
    throw new Error(`Renditions not ready: ${missing.map((r) => r.name).join(', ') || 'none'}`);
  }
  await videos.addEvent(videoId, 'package', `Packaging ${renditions.length} renditions as HLS`);

  await mkdir(deps.tmpDir, {recursive: true});
  const root = await mkdtemp(join(deps.tmpDir, TMP_PREFIX));
  try {
    const variants: Variant[] = [];
    let segments = 0;
    for (const [i, rendition] of renditions.entries()) {
      const {variant, segmentCount} = await packageRendition(deps, videoId, rendition, root);
      variants.push(variant);
      segments += segmentCount;
      await videos.update(videoId, {progress: 85 + Math.floor((10 * (i + 1)) / renditions.length)});
    }

    await storage.put(masterKey, buildMasterPlaylist(variants), {
      contentType: hlsContentType('master.m3u8'),
      cacheControl: CACHE.playlist,
    });

    const ready = await videos.transition(videoId, 'ready', {progress: 100, readyAt: new Date()});
    if (!ready) throw new UnrecoverableError('Video was canceled while packaging');
    await videos.addEvent(
      videoId,
      'ready',
      `Ready: ${variants.length} renditions, ${segments} segments, ${masterKey.split('/').pop()}`,
    );
    await deps.pipeline.enqueueNotify(videoId, video.userId, 'video.ready');

    if (!deps.keepRenditionMp4) await storage.deletePrefix(`work/${videoId}/`);
    return {masterKey, renditions: renditions.map((r) => r.name)};
  } finally {
    await rm(root, {recursive: true, force: true});
  }
}

async function packageRendition(
  deps: PackageDeps,
  videoId: string,
  rendition: Rendition,
  root: string,
): Promise<{variant: Variant; segmentCount: number}> {
  const {storage, videos} = deps;
  const dir = join(root, rendition.name);
  await mkdir(dir);
  const input = await storage.presignGet(rendition.mp4Key ?? '', 3600);
  await runFfmpeg(hlsArgs(input, dir, deps.segmentSeconds ?? 2));

  const [bandwidth, info] = await Promise.all([
    measureBandwidth(dir),
    probe(join(dir, 'index.m3u8')),
  ]);

  const prefix = keys.renditionDir(videoId, rendition.name);
  const files = await readdir(dir);
  await mapLimit(files, 8, (file) =>
    storage.putFile(`${prefix}${file}`, join(dir, file), {
      contentType: hlsContentType(file),
      // Segments and init never change; the playlist could be rewritten.
      cacheControl: file.endsWith('.m3u8') ? CACHE.playlist : CACHE.immutable,
    }),
  );
  await videos.updateRendition(rendition.id, {
    status: 'packaged',
    playlistKey: `${prefix}index.m3u8`,
  });

  const codecs = [avcCodec(info.videoProfile, info.videoLevel), info.hasAudio ? 'mp4a.40.2' : null]
    .filter(Boolean)
    .join(',');
  return {
    segmentCount: bandwidth.segments,
    variant: {
      uri: `${rendition.name}/index.m3u8`,
      bandwidth: bandwidth.peak,
      averageBandwidth: bandwidth.average,
      width: rendition.width,
      height: rendition.height,
      fps: info.fps,
      codecs,
    },
  };
}
