import {describe, expect, it} from 'vitest';

import {createUploadSchema, MAX_PARTS, MIN_PART_SIZE, planParts} from './video';

const MiB = 1024 * 1024;

describe('planParts', () => {
  it('uses 16 MiB parts for ordinary files', () => {
    expect(planParts(100 * MiB)).toEqual({partSize: 16 * MiB, partCount: 7});
  });

  it('uses one part for tiny files', () => {
    expect(planParts(10)).toEqual({partSize: 16 * MiB, partCount: 1});
  });

  it('grows parts so huge files stay under 10,000 parts', () => {
    const size = 500 * 1024 * MiB; // 500 GiB
    const {partSize, partCount} = planParts(size);
    expect(partCount).toBeLessThanOrEqual(MAX_PARTS);
    expect(partSize % MiB).toBe(0);
  });

  it('never goes below the S3 minimum', () => {
    expect(planParts(100 * MiB, 1).partSize).toBe(MIN_PART_SIZE);
  });
});

describe('createUploadSchema', () => {
  it('rejects non-video types', () => {
    const r = createUploadSchema.safeParse({
      title: 'x',
      fileName: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10,
    });
    expect(r.success).toBe(false);
  });
});
