import {describe, expect, it} from 'vitest';

import {desiredReplicas} from '../src';

const policy = {min: 1, max: 8, jobsPerReplica: 2, scaleDownDelaySec: 300};
const at = (sec: number) => 1_000_000 + sec * 1000;

describe('desiredReplicas', () => {
  it('scales up at once for a backlog', () => {
    const r = desiredReplicas({waiting: 9, active: 2}, {current: 2, lowSince: null}, policy, at(0));
    expect(r).toMatchObject({desired: 7, current: 7, lowSince: null});
  });

  it('never goes above max or below min', () => {
    expect(
      desiredReplicas({waiting: 500, active: 4}, {current: 4, lowSince: null}, policy).desired,
    ).toBe(8);
    expect(
      desiredReplicas({waiting: 0, active: 0}, {current: 1, lowSince: null}, policy).desired,
    ).toBe(1);
  });

  it('waits before scaling down, then drops to what is needed', () => {
    let s = {current: 6, lowSince: null as number | null};
    const quiet = {waiting: 0, active: 1};
    let r = desiredReplicas(quiet, s, policy, at(0));
    expect(r).toMatchObject({desired: 6, lowSince: at(0)});
    s = r;
    r = desiredReplicas(quiet, s, policy, at(299));
    expect(r.desired).toBe(6);
    s = r;
    r = desiredReplicas(quiet, s, policy, at(300));
    expect(r).toMatchObject({desired: 1, lowSince: null});
  });

  it('cancels a pending scale-down when load returns', () => {
    const r1 = desiredReplicas(
      {waiting: 0, active: 1},
      {current: 4, lowSince: null},
      policy,
      at(0),
    );
    const r2 = desiredReplicas({waiting: 6, active: 1}, r1, policy, at(100));
    expect(r2).toMatchObject({desired: 4, lowSince: null});
  });
});
