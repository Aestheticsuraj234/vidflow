import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, renameSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

/** Small generated videos for tests. Made once per machine and cached in /tmp. */
export const FIXTURES = join(tmpdir(), 'vidflow-fixtures');

const x264 = '-c:v libx264 -preset ultrafast';
const recipes: Record<string, string> = {
  'landscape.mp4': `-f lavfi -i testsrc2=size=1280x720:rate=30 -f lavfi -i sine=frequency=440 -t 3 ${x264} -c:a aac -shortest`,
  'silent-small.mp4': `-f lavfi -i testsrc2=size=320x180:rate=25 -t 2 ${x264}`,
  'portrait.mov': `-f lavfi -i testsrc2=size=1080x1920:rate=30 -f lavfi -i sine=frequency=220 -t 2 ${x264} -c:a aac -shortest`,
  'audio-only.m4a': '-f lavfi -i sine=frequency=440 -t 2 -c:a aac',
};

function ffmpeg(args: string[]): void {
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
}

export function fixture(name: string): string {
  mkdirSync(FIXTURES, {recursive: true});
  const path = join(FIXTURES, name);
  if (existsSync(path)) return path;

  // Write under a temporary name and rename, so parallel test runs never see
  // a half-written file.
  const tmp = join(FIXTURES, `.${process.pid}-${Date.now()}${name.slice(name.lastIndexOf('.'))}`);
  if (name === 'not-a-video.mp4') {
    writeFileSync(tmp, 'this is not a video');
  } else if (name === 'rotated.mp4') {
    // A landscape-encoded phone video that should display as portrait.
    ffmpeg(['-display_rotation', '90', '-i', fixture('landscape.mp4'), '-c', 'copy', tmp]);
  } else {
    const recipe = recipes[name];
    if (!recipe) throw new Error(`No fixture ${name}`);
    ffmpeg([...recipe.split(' '), tmp]);
  }
  renameSync(tmp, path);
  return path;
}
