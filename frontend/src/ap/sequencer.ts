/**
 * Trial sequence generation.
 *
 * 1. Balance: pitch classes are spread as evenly as possible over the trials
 *    (counts differ by at most 1); within each pitch class the allowed
 *    (octave, timbre) combinations are cycled in shuffled order.
 * 2. Order: randomized greedy with restarts under constraints —
 *    never the same pitch class twice in a row, and optionally a minimum leap
 *    |Δmidi| between consecutive tones (tests use > 1 octave, which makes
 *    relative-pitch strategies from the previous tone useless). If a leap
 *    constraint is infeasible it is relaxed one semitone at a time.
 */
import { midiOf, type PitchClass } from '@/music/pitch'
import type { TimbreId } from '@/audio/instruments'
import { randInt, shuffle, type Rng } from '@/lib/random'

export interface Stimulus {
  midi: number
  pitchClass: PitchClass
  octave: number
  timbre: TimbreId
}

export interface SequenceSpec {
  pitchSet: readonly PitchClass[]
  octaves: readonly number[]
  timbres: readonly TimbreId[]
  trials: number
  minLeap: number
}

export type RangeOf = (timbre: TimbreId) => readonly [number, number]

const ATTEMPTS = 400

const ALLOCATIONS = 20

export function generateSequence(spec: SequenceSpec, rangeOf: RangeOf, rng: Rng): Stimulus[] {
  let items = balancedItems(spec, rangeOf, rng)
  for (let leap = spec.minLeap; leap >= 0; leap--) {
    // A given allocation can make a leap infeasible; re-draw it before relaxing.
    for (let alloc = 0; alloc < (leap > 0 ? ALLOCATIONS : 1); alloc++) {
      if (alloc > 0) items = balancedItems(spec, rangeOf, rng)
      for (let attempt = 0; attempt < ATTEMPTS / ALLOCATIONS; attempt++) {
        const ordered = orderGreedy(items, leap, rng)
        if (ordered) return ordered
      }
    }
  }
  // Unreachable unless the set has a single pitch class; fall back to shuffle.
  return shuffle(rng, items)
}

function balancedItems(spec: SequenceSpec, rangeOf: RangeOf, rng: Rng): Stimulus[] {
  const { pitchSet, trials } = spec
  if (pitchSet.length === 0) throw new Error('empty pitch set')

  // Pitch-class counts: base each, remainder to randomly chosen classes.
  const base = Math.floor(trials / pitchSet.length)
  const extra = new Set(shuffle(rng, pitchSet).slice(0, trials % pitchSet.length))

  const combosOf = new Map<PitchClass, Stimulus[]>()
  for (const pc of pitchSet) {
    const combos: Stimulus[] = []
    for (const octave of spec.octaves) {
      for (const timbre of spec.timbres) {
        const midi = midiOf(pc, octave)
        const [lo, hi] = rangeOf(timbre)
        if (midi >= lo && midi <= hi) combos.push({ midi, pitchClass: pc, octave, timbre })
      }
    }
    if (combos.length === 0) throw new Error(`no playable octave/timbre for pitch class ${pc}`)
    combosOf.set(pc, combos)
  }

  // Round-robin over pitch classes; each pick takes, from that class's not-yet-
  // used combinations (refilled when exhausted), the one whose octave and timbre
  // are globally least used — so octaves and timbres balance across the block.
  const want = new Map(pitchSet.map((pc) => [pc, base + (extra.has(pc) ? 1 : 0)]))
  const pools = new Map<PitchClass, Stimulus[]>()
  const octCount = new Map<number, number>()
  const timbreCount = new Map<string, number>()
  const out: Stimulus[] = []
  while (out.length < trials) {
    for (const pc of shuffle(rng, pitchSet)) {
      if (want.get(pc)! === 0) continue
      let pool = pools.get(pc)
      if (!pool || pool.length === 0) pools.set(pc, (pool = shuffle(rng, combosOf.get(pc)!)))
      let bestI = 0
      let bestScore = Infinity
      pool.forEach((c, i) => {
        const score = (octCount.get(c.octave) ?? 0) * 1000 + (timbreCount.get(c.timbre) ?? 0)
        if (score < bestScore) {
          bestScore = score
          bestI = i
        }
      })
      const pick = pool.splice(bestI, 1)[0]!
      octCount.set(pick.octave, (octCount.get(pick.octave) ?? 0) + 1)
      timbreCount.set(pick.timbre, (timbreCount.get(pick.timbre) ?? 0) + 1)
      want.set(pc, want.get(pc)! - 1)
      out.push(pick)
    }
  }
  return out
}

function compatible(a: Stimulus, b: Stimulus, minLeap: number): boolean {
  return a.pitchClass !== b.pitchClass && Math.abs(a.midi - b.midi) >= minLeap
}

/**
 * Builds a path through all items where consecutive items are compatible.
 * Warnsdorff-style heuristic: pick (randomly among) the candidates with the
 * fewest compatible successors left, so hard-to-place items are not stranded.
 */
function orderGreedy(items: readonly Stimulus[], minLeap: number, rng: Rng): Stimulus[] | null {
  const remaining = shuffle(rng, items)
  const out: Stimulus[] = []
  let prev: Stimulus | null = null
  while (remaining.length > 0) {
    let best: number[] = []
    let bestDeg = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i]!
      if (prev && !compatible(prev, c, minLeap)) continue
      let deg = 0
      for (let j = 0; j < remaining.length; j++) {
        if (j !== i && compatible(c, remaining[j]!, minLeap)) deg++
      }
      // Items with no successors are only acceptable as the very last item.
      if (deg === 0 && remaining.length > 1) continue
      if (deg < bestDeg) {
        bestDeg = deg
        best = [i]
      } else if (deg === bestDeg) {
        best.push(i)
      }
    }
    if (best.length === 0) return null
    const pick = best[randInt(rng, 0, best.length)]!
    prev = remaining.splice(pick, 1)[0]!
    out.push(prev)
  }
  return out
}
