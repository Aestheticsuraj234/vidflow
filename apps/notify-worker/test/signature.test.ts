import {describe, expect, it} from 'vitest';

import {signPayload, verifySignature} from '../src/signature';
import {isPrivateAddress} from '../src/ssrf';

describe('signatures', () => {
  const now = 1_800_000_000_000;
  const header = signPayload('whsec_test', '{"a":1}', now / 1000);

  it('verifies a genuine signature', () => {
    expect(header).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
    expect(verifySignature('whsec_test', '{"a":1}', header, {now})).toBe(true);
  });

  it('rejects a changed body, wrong secret or old timestamp', () => {
    expect(verifySignature('whsec_test', '{"a":2}', header, {now})).toBe(false);
    expect(verifySignature('whsec_other', '{"a":1}', header, {now})).toBe(false);
    expect(verifySignature('whsec_test', '{"a":1}', header, {now: now + 301_000})).toBe(false);
    expect(verifySignature('whsec_test', '{"a":1}', 'garbage', {now})).toBe(false);
  });
});

describe('isPrivateAddress', () => {
  it.each([
    ['127.0.0.1', true],
    ['10.1.2.3', true],
    ['172.20.0.1', true],
    ['192.168.1.1', true],
    ['169.254.169.254', true],
    ['100.64.0.1', true],
    ['::1', true],
    ['fd00::1', true],
    ['::ffff:10.0.0.1', true],
    ['8.8.8.8', false],
    ['172.32.0.1', false],
    ['2606:4700::1111', false],
  ])('%s → %s', (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected);
  });
});
