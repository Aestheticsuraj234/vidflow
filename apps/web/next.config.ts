import {fileURLToPath} from 'node:url';

import type {NextConfig} from 'next';

const config: NextConfig = {
  transpilePackages: ['@vidflow/shared'],
  // A self-contained server in .next/standalone for the Docker image.
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
};

export default config;
