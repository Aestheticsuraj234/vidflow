import {mkdir, mkdtemp, readdir, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {
  avcCodec,
  buildMasterPlaylist,
  h264Args,
  hlsArgs,
  hlsContentType,
  measureBandwidth,
  parseMediaPlaylist,
  probe,
  runFfmpeg,
} from '../src';
import {fixture} from '../src/testing';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vf-hls-'));
});
afterAll(() => rm(dir, {recursive: true, force: true}));

describe('HLS packaging', () => {
  it('segments an MP4 into fMP4 HLS without re-encoding', async () => {
    const mp4 = join(dir, '360p.mp4');
    await runFfmpeg(
      h264Args(
        fixture('landscape.mp4'),
        mp4,
        {width: 640, height: 360, videoBitrateKbps: 800, audioBitrateKbps: 96},
        {gopFrames: 60, preset: 'ultrafast'},
      ),
    );
    const out = join(dir, '360p');
    await mkdir(out);
    await runFfmpeg(hlsArgs(mp4, out));

    expect((await readdir(out)).sort()).toEqual([
      'index.m3u8',
      'init.mp4',
      'seg_00000.m4s',
      'seg_00001.m4s',
    ]);
    const playlist = await readFile(join(out, 'index.m3u8'), 'utf8');
    expect(playlist).toContain('#EXT-X-PLAYLIST-TYPE:VOD');
    expect(playlist).toContain('#EXT-X-MAP:URI="init.mp4"');
    expect(playlist).toContain('#EXT-X-ENDLIST');
    // 3 s with keyframes every 2 s: a 2 s and a 1 s segment.
    expect(parseMediaPlaylist(playlist).map((s) => Math.round(s.durationSec))).toEqual([2, 1]);

    const bw = await measureBandwidth(out);
    expect(bw.segments).toBe(2);
    expect(bw.average).toBeGreaterThan(200_000);
    expect(bw.peak).toBeGreaterThanOrEqual(bw.average);

    // The playlist plays: ffprobe reads it like a player would.
    const info = await probe(join(out, 'index.m3u8'));
    expect(info).toMatchObject({width: 640, height: 360, hasAudio: true});
    // ultrafast needs only Constrained Baseline, so CODECS must come from probing.
    expect(info.videoProfile).toBe('Constrained Baseline');
  });
});

describe('playlists', () => {
  it('parses media playlists', () => {
    expect(
      parseMediaPlaylist(
        '#EXTM3U\n#EXTINF:2.000000,\nseg_1.m4s\n#EXTINF:0.5,\nseg_2.m4s\n#EXT-X-ENDLIST\n',
      ),
    ).toEqual([
      {uri: 'seg_1.m4s', durationSec: 2},
      {uri: 'seg_2.m4s', durationSec: 0.5},
    ]);
  });

  it('builds codec strings', () => {
    expect(avcCodec('High', 31)).toBe('avc1.64001f');
    expect(avcCodec('Main', 40)).toBe('avc1.4d0028');
    expect(avcCodec('Constrained Baseline', 30)).toBe('avc1.42e01e');
  });

  it('writes a master playlist, best first', () => {
    const text = buildMasterPlaylist([
      {
        uri: '360p/index.m3u8',
        bandwidth: 900_000,
        averageBandwidth: 800_000,
        width: 640,
        height: 360,
        fps: 30,
        codecs: 'avc1.64001e,mp4a.40.2',
      },
      {
        uri: '720p/index.m3u8',
        bandwidth: 3_000_000,
        averageBandwidth: 2_800_000,
        width: 1280,
        height: 720,
        fps: 30,
        codecs: 'avc1.64001f,mp4a.40.2',
      },
    ]);
    expect(text).toBe(
      [
        '#EXTM3U',
        '#EXT-X-VERSION:7',
        '#EXT-X-INDEPENDENT-SEGMENTS',
        '',
        '#EXT-X-STREAM-INF:BANDWIDTH=3000000,AVERAGE-BANDWIDTH=2800000,RESOLUTION=1280x720,FRAME-RATE=30.000,CODECS="avc1.64001f,mp4a.40.2"',
        '720p/index.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=900000,AVERAGE-BANDWIDTH=800000,RESOLUTION=640x360,FRAME-RATE=30.000,CODECS="avc1.64001e,mp4a.40.2"',
        '360p/index.m3u8',
        '',
      ].join('\n'),
    );
  });

  it('knows content types', () => {
    expect(hlsContentType('index.m3u8')).toBe('application/vnd.apple.mpegurl');
    expect(hlsContentType('seg_00001.m4s')).toBe('video/iso.segment');
    expect(hlsContentType('init.mp4')).toBe('video/mp4');
  });
});
