/**
 * Which timbres the protocol trains and tests with.
 * Real-instrument samples when available (Wong et al. 2020 Exp. 3 trained piano,
 * violin and clarinet; an untrained plucked timbre tests generalisation),
 * otherwise distinct synthesized timbres.
 */
import { listTimbres, type TimbreId } from '@/audio/instruments'

export interface TimbreConfig {
  trained: TimbreId[]
  untrained: TimbreId
  usingSamples: boolean
}

export function timbreConfig(
  available: readonly TimbreId[] = listTimbres().map((t) => t.id),
): TimbreConfig {
  const has = (...ids: TimbreId[]) => ids.every((id) => available.includes(id))
  if (has('piano', 'violin', 'clarinet', 'harp')) {
    return { trained: ['piano', 'violin', 'clarinet'], untrained: 'harp', usingSamples: true }
  }
  return { trained: ['complex', 'triangle', 'bright'], untrained: 'square', usingSamples: false }
}
