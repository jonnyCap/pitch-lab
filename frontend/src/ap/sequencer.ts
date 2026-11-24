/**
 * Trial sequence generation.
 *
 * 1. Allocation: in-set pitch classes are spread as evenly as possible over the
 *    trials (counts differ by at most 1) — or proportionally to `weights` for
 *    adaptive practice and drills. Optionally a share of out-of-set distractor
 *    tones is mixed in, preferring the set's chromatic neighbours (the hardest
 *    to reject). Octaves and timbres are balanced globally across the block.
 * 2. Order: randomized Warnsdorff-style greedy with restarts under constraints —
 *    never the same pitch class twice in a row, and optionally a minimum leap
 *    |Δmidi| between consecutive tones (tests use > 1 octave, which makes
 *    relative-pitch strategies from the previous tone useless). If a leap is
 *    infeasible, the allocation is re-drawn, then the leap relaxed one semitone
 *    at a time. In adaptive blocks, confused pairs are preferably played back to
 *    back so the contrast is trained directly.
 * 3. Special trials: a random few in-set trials are marked as 3-point ⭐ trials.
 */
import { midiOf, type PitchClass } from '@/music/pitch'
import type { TimbreId } from '@/audio/instruments'
import { randInt, shuffle, type Rng } from '@/lib/random'

export interface Stimulus {
  midi: number
  pitchClass: PitchClass
  octave: number
  timbre: TimbreId
  /** Out-of-set tone: the correct answer is "not in my set". */
  isDistractor: boolean
  /** 3-point bonus trial. */
  special: boolean
}

export interface SequenceSpec {
  pitchSet: readonly PitchClass[]
  octaves: readonly number[]
  timbres: readonly TimbreId[]
  trials: number
  minLeap: number
  distractorRate?: number
  specialRate?: number
  /** Relative sampling weight per in-set pitch class (default: uniform). */
  weights?: Partial<Record<PitchClass, number>>
  /** pitch class → pitch classes it is confused with (adaptive ordering). */
  partners?: Partial<Record<PitchClass, readonly PitchClass[]>>
}

export type RangeOf = (timbre: TimbreId) => readonly [number, number]

const ATTEMPTS = 400
const ALLOCATIONS = 20
/** Probability of following a tone with one of its confusion partners when possible. */
const PARTNER_BIAS = 0.6
/** Share of distractors taken from the set's chromatic neighbours. */
const NEIGHBOUR_SHARE = 0.7

export function generateSequence(spec: SequenceSpec, rangeOf: RangeOf, rng: Rng): Stimulus[] {
  let items = allocate(spec, rangeOf, rng)
  let ordered: Stimulus[] | null = null
  outer: for (let leap = spec.minLeap; leap >= 0; leap--) {
    // A given allocation can make a leap infeasible; re-draw it before relaxing.
    for (let alloc = 0; alloc < (leap > 0 ? ALLOCATIONS : 1); alloc++) {
      if (alloc > 0) items = allocate(spec, rangeOf, rng)
      for (let attempt = 0; attempt < ATTEMPTS / ALLOCATIONS; attempt++) {
        ordered = orderGreedy(items, leap, rng, spec.partners)
        if (ordered) break outer
      }
    }
  }
  // Only unreachable orderings (e.g. a single pitch class) fall back to a shuffle.
  const out = ordered ?? shuffle(rng, items)
  const specialRate = spec.specialRate ?? 0
  return out.map((s) => ({ ...s, special: !s.isDistractor && rng() < specialRate }))
}

/**
 * Splits `n` into integer counts proportional to `weights` (largest remainder,
 * ties broken randomly). With `min`, classes that would get fewer than `min`
 * are topped up from the largest classes, so every class still occurs.
 */
export function proportionalCounts<K>(
  n: number,
  keys: readonly K[],
  weights: (k: K) => number,
  rng: Rng,
  min = 0,
): Map<K, number> {
  if (min * keys.length > n) throw new Error('not enough trials for the minimum per class')
  const raw = keys.map((k) => Math.max(0, weights(k)))
  const sum = raw.reduce((a, b) => a + b, 0)
  // All-zero weights fall back to uniform.
  const w = sum > 0 ? raw : raw.map(() => 1)
  const total = sum > 0 ? sum : keys.length
  const exact = keys.map((k, i) => ({ k, x: (n * w[i]!) / total }))
  const counts = new Map<K, number>(exact.map((e) => [e.k, Math.floor(e.x)]))
  const rest = n - [...counts.values()].reduce((a, b) => a + b, 0)
  const order = shuffle(rng, exact).sort((a, b) => (b.x % 1) - (a.x % 1))
  for (let i = 0; i < rest; i++) {
    const k = order[i % order.length]!.k
    counts.set(k, counts.get(k)! + 1)
  }
  for (const k of keys) {
    while (counts.get(k)! < min) {
      const donor = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]
      counts.set(donor, counts.get(donor)! - 1)
      counts.set(k, counts.get(k)! + 1)
    }
  }
  return counts
}

function combosFor(
  pc: PitchClass,
  spec: SequenceSpec,
  rangeOf: RangeOf,
  isDistractor: boolean,
): Stimulus[] {
  const combos: Stimulus[] = []
  for (const octave of spec.octaves) {
    for (const timbre of spec.timbres) {
      const midi = midiOf(pc, octave)
      const [lo, hi] = rangeOf(timbre)
      if (midi >= lo && midi <= hi) {
        combos.push({ midi, pitchClass: pc, octave, timbre, isDistractor, special: false })
      }
    }
  }
  return combos
}

function allocate(spec: SequenceSpec, rangeOf: RangeOf, rng: Rng): Stimulus[] {
  const { pitchSet, trials } = spec
  if (pitchSet.length === 0) throw new Error('empty pitch set')

  // --- How many trials per class ---------------------------------------------
  const outside = ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as PitchClass[]).filter(
    (pc) => !pitchSet.includes(pc),
  )
  const nDistractors =
    outside.length > 0 ? Math.round(trials * Math.max(0, spec.distractorRate ?? 0)) : 0
  const nSet = trials - nDistractors
  const want = new Map<PitchClass, number>()
  if (spec.weights) {
    const w = spec.weights
    const counts = proportionalCounts(
      nSet,
      pitchSet,
      (pc) => w[pc] ?? 0,
      rng,
      nSet >= pitchSet.length ? 1 : 0,
    )
    for (const [pc, c] of counts) if (c > 0) want.set(pc, c)
  } else {
    const base = Math.floor(nSet / pitchSet.length)
    const extra = new Set(shuffle(rng, pitchSet).slice(0, nSet % pitchSet.length))
    for (const pc of pitchSet) want.set(pc, base + (extra.has(pc) ? 1 : 0))
  }

  const neighbours = outside.filter((pc) =>
    pitchSet.some((s) => (s + 1) % 12 === pc || (s + 11) % 12 === pc),
  )
  const distractorWant = new Map<PitchClass, number>()
  for (let i = 0; i < nDistractors; i++) {
    const pool = neighbours.length > 0 && rng() < NEIGHBOUR_SHARE ? neighbours : outside
    const pc = pool[randInt(rng, 0, pool.length)]!
    distractorWant.set(pc, (distractorWant.get(pc) ?? 0) + 1)
  }

  // --- Playable combinations per class ---------------------------------------
  type Key = string
  const classes: {
    key: Key
    pc: PitchClass
    distractor: boolean
    n: number
    combos: Stimulus[]
  }[] = []
  for (const [pc, n] of want) {
    const combos = combosFor(pc, spec, rangeOf, false)
    if (combos.length === 0) throw new Error(`no playable octave/timbre for pitch class ${pc}`)
    classes.push({ key: `s${pc}`, pc, distractor: false, n, combos })
  }
  for (const [pc, n] of distractorWant) {
    const combos = combosFor(pc, spec, rangeOf, true)
    if (combos.length > 0) classes.push({ key: `d${pc}`, pc, distractor: true, n, combos })
  }

  // Round-robin over classes; each pick takes, from that class's not-yet-used
  // combinations (refilled when exhausted), the one whose octave and timbre are
  // globally least used — so octaves and timbres balance across the block.
  const left = new Map(classes.map((c) => [c.key, c.n]))
  const pools = new Map<Key, Stimulus[]>()
  const octCount = new Map<number, number>()
  const timbreCount = new Map<string, number>()
  const out: Stimulus[] = []
  const total = classes.reduce((s, c) => s + c.n, 0)
  while (out.length < total) {
    for (const c of shuffle(rng, classes)) {
      if (left.get(c.key)! === 0) continue
      let pool = pools.get(c.key)
      if (!pool || pool.length === 0) pools.set(c.key, (pool = shuffle(rng, c.combos)))
      let bestI = 0
      let bestScore = Infinity
      pool.forEach((s, i) => {
        const score = (octCount.get(s.octave) ?? 0) * 1000 + (timbreCount.get(s.timbre) ?? 0)
        if (score < bestScore) {
          bestScore = score
          bestI = i
        }
      })
      const pick = pool.splice(bestI, 1)[0]!
      octCount.set(pick.octave, (octCount.get(pick.octave) ?? 0) + 1)
      timbreCount.set(pick.timbre, (timbreCount.get(pick.timbre) ?? 0) + 1)
      left.set(c.key, left.get(c.key)! - 1)
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
function orderGreedy(
  items: readonly Stimulus[],
  minLeap: number,
  rng: Rng,
  partners?: SequenceSpec['partners'],
): Stimulus[] | null {
  const remaining = shuffle(rng, items)
  const out: Stimulus[] = []
  let prev: Stimulus | null = null
  while (remaining.length > 0) {
    const candidates: { i: number; deg: number }[] = []
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
      candidates.push({ i, deg })
      bestDeg = Math.min(bestDeg, deg)
    }
    if (candidates.length === 0) return null

    let pool = candidates.filter((c) => c.deg === bestDeg)
    const prevPartners = prev ? partners?.[prev.pitchClass] : undefined
    if (prevPartners?.length && rng() < PARTNER_BIAS) {
      // Allow slightly worse degree to play a confused pair back to back.
      const paired = candidates.filter(
        (c) => c.deg <= bestDeg + 1 && prevPartners.includes(remaining[c.i]!.pitchClass),
      )
      if (paired.length > 0) pool = paired
    }
    const pick = pool[randInt(rng, 0, pool.length)]!.i
    prev = remaining.splice(pick, 1)[0]!
    out.push(prev)
  }
  return out
}
