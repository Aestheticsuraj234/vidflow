export interface ScalePolicy {
  min: number;
  max: number;
  /** Waiting jobs one replica should have queued for it before adding another. */
  jobsPerReplica: number;
  /** Seconds of steady low load before scaling down (scale-ups are immediate). */
  scaleDownDelaySec: number;
}

export interface ScaleState {
  current: number;
  /** When the load first dropped below the current size, if it has. */
  lowSince: number | null;
}

/**
 * Replicas wanted for a queue: enough to cover jobs running now plus a share
 * of the backlog. Up fast (a backlog means users waiting), down slowly
 * (encoders are cheap to keep a few minutes, expensive to start cold).
 */
export function desiredReplicas(
  {waiting, active}: {waiting: number; active: number},
  state: ScaleState,
  policy: ScalePolicy,
  now = Date.now(),
): ScaleState & {desired: number; reason: string} {
  const clamp = (n: number) => Math.min(policy.max, Math.max(policy.min, n));
  const target = clamp(active + Math.ceil(waiting / policy.jobsPerReplica));

  if (target > state.current) {
    return {
      current: target,
      lowSince: null,
      desired: target,
      reason: `backlog ${waiting}, active ${active}`,
    };
  }
  if (target === state.current) {
    return {...state, lowSince: null, desired: state.current, reason: 'steady'};
  }
  const lowSince = state.lowSince ?? now;
  if (now - lowSince >= policy.scaleDownDelaySec * 1000) {
    return {
      current: target,
      lowSince: null,
      desired: target,
      reason: `idle for ${policy.scaleDownDelaySec}s`,
    };
  }
  return {
    current: state.current,
    lowSince,
    desired: state.current,
    reason: 'waiting before scaling down',
  };
}
