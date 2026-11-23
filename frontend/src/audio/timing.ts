/**
 * Maps AudioContext time to the performance.now() clock so response times can
 * be measured from the moment a tone actually leaves the speakers, using the
 * same clock as DOM event timestamps (Event.timeStamp).
 */

export interface OutputClock {
  readonly currentTime: number
  readonly baseLatency?: number
  readonly outputLatency?: number
  getOutputTimestamp?: () => AudioTimestamp
}

/**
 * performance.now()-based timestamp (ms) at which audio scheduled for
 * `contextTime` is presented at the output.
 */
export function contextTimeToPerfMs(
  ctx: OutputClock,
  contextTime: number,
  now: () => number = () => performance.now(),
): number {
  const ts = ctx.getOutputTimestamp?.()
  if (
    ts &&
    ts.contextTime !== undefined &&
    ts.performanceTime !== undefined &&
    ts.performanceTime > 0
  ) {
    // getOutputTimestamp already accounts for the output pipeline latency.
    return ts.performanceTime + (contextTime - ts.contextTime) * 1000
  }
  const latency = ctx.outputLatency || ctx.baseLatency || 0
  return now() + (contextTime - ctx.currentTime + latency) * 1000
}

/** Response time in ms between audible onset and a DOM event timestamp. */
export function responseTimeMs(onsetPerfMs: number, eventTimeStamp: number): number {
  return Math.max(0, Math.round(eventTimeStamp - onsetPerfMs))
}
