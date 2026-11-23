import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayedSound } from '@/audio/engine'
import { mulberry32 } from '@/lib/random'
import { buildLadder, DEFAULT_PITCH_ORDER, type LevelSpec } from './protocol'
import { LevelRunner, type RecordedTrial, type RunnerAudio, type RunnerState } from './runner'
import type { Stimulus } from './sequencer'

const LEAD = 60

function fakeAudio() {
  const log: string[] = []
  const sound = (label: string, durMs: number): Promise<PlayedSound> => {
    log.push(label)
    const start = performance.now()
    let stop!: () => void
    const ended = new Promise<void>((resolve) => {
      const t = setTimeout(resolve, LEAD + durMs)
      stop = () => {
        clearTimeout(t)
        resolve()
      }
    })
    return Promise.resolve({ contextStart: 0, onsetPerfMs: start + LEAD, ended, stop })
  }
  const audio: RunnerAudio = {
    playTone: (timbre, midi) => sound(`tone:${timbre}:${midi}`, 1000),
    playShepard: (sec) => sound(`shepard:${sec}`, sec * 1000),
    playNoise: (sec) => sound(`noise:${sec}`, sec * 1000),
  }
  return { audio, log }
}

const ladder = buildLadder({
  pitchOrder: DEFAULT_PITCH_ORDER,
  trainedTimbres: ['piano'],
  deadlineMs: 5000,
})
const level = (id: string): LevelSpec => ladder.find((l) => l.id === id)!
const stim = (midi: number): Stimulus => ({
  midi,
  pitchClass: (midi % 12) as Stimulus['pitchClass'],
  octave: Math.floor(midi / 12) - 1,
  timbre: 'piano',
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('LevelRunner', () => {
  it('runs a feedback step: tone, response, feedback replay, ITI; measures RT from onset', async () => {
    const { audio, log } = fakeAudio()
    const states: RunnerState[] = []
    const trials: RecordedTrial[] = []
    const seq = [stim(64), stim(65)]
    const runner = new LevelRunner(level('t3-s1'), seq, {
      audio,
      rng: mulberry32(1),
      onState: (s) => states.push(s),
      onTrial: (t) => void trials.push(t),
      itiMinMs: 2000,
      itiMaxMs: 2000,
    })
    const done = runner.run()

    await vi.advanceTimersByTimeAsync(0)
    expect(runner.snapshot.phase).toBe('listening')
    await vi.advanceTimersByTimeAsync(LEAD + 740)
    expect(runner.respond(4, performance.now())).toBe(true)
    expect(runner.respond(4)).toBe(false) // only one answer per trial
    await vi.advanceTimersByTimeAsync(0)
    expect(runner.snapshot.phase).toBe('feedback')
    expect(runner.snapshot.feedback).toEqual({ target: 4, response: 4, correct: true })

    // Let feedback + ITI pass, then answer the 2nd trial wrongly.
    await vi.advanceTimersByTimeAsync(1400 + 2000)
    expect(runner.snapshot.phase).toBe('listening')
    expect(runner.snapshot.index).toBe(1)
    await vi.advanceTimersByTimeAsync(LEAD + 1000)
    runner.respond(6, performance.now())
    await vi.advanceTimersByTimeAsync(5000)

    const result = await done
    expect(result).not.toBeNull()
    expect(trials.map((t) => [t.target, t.response, t.correct, t.rtMs])).toEqual([
      [4, 4, true, 740],
      [5, 6, false, 1000],
    ])
    expect(trials[1]!.prevMidi).toBe(64)
    expect(result!.summary.accuracy).toBe(0.5)
    // Tone, feedback replay, tone, feedback replay — no interference in feedback steps.
    expect(log).toEqual(['tone:piano:64', 'tone:piano:64', 'tone:piano:65', 'tone:piano:65'])
    expect(states.at(-1)!.phase).toBe('done')
  })

  it('records a timeout when no answer arrives before the deadline', async () => {
    const { audio } = fakeAudio()
    const trials: RecordedTrial[] = []
    const runner = new LevelRunner(level('t3-s1'), [stim(64)], {
      audio,
      rng: mulberry32(1),
      onTrial: (t) => void trials.push(t),
    })
    const done = runner.run()
    await vi.advanceTimersByTimeAsync(LEAD + 5000 + 1)
    await vi.advanceTimersByTimeAsync(5000)
    await done
    expect(trials[0]).toMatchObject({ response: 'timeout', correct: false, rtMs: null })
  })

  it('no-feedback step: Shepard first, no feedback replay, noise between trials, answers locked during interference', async () => {
    const { audio, log } = fakeAudio()
    const runner = new LevelRunner(level('t3-s2'), [stim(64), stim(66)], {
      audio,
      rng: mulberry32(1),
      shepardSec: 15,
      itiMinMs: 1500,
      itiMaxMs: 1500,
    })
    const done = runner.run()
    await vi.advanceTimersByTimeAsync(0)
    expect(runner.snapshot.phase).toBe('interference')
    expect(runner.respond(4)).toBe(false)
    await vi.advanceTimersByTimeAsync(LEAD + 15000)
    expect(runner.snapshot.phase).toBe('listening')
    runner.respond(4, performance.now())
    // The noise (1 s) must end before the rest of the inter-trial gap even starts.
    await vi.advanceTimersByTimeAsync(LEAD + 1000 - 1)
    expect(runner.snapshot.phase).toBe('pause')
    await vi.advanceTimersByTimeAsync(1 + 1500)
    expect(runner.snapshot.phase).toBe('listening')
    runner.respond(6, performance.now())
    const result = await done
    expect(log).toEqual(['shepard:15', 'tone:piano:64', 'noise:1', 'tone:piano:66'])
    expect(result!.summary.passed).toBe(true)
  })

  it('ignores answers outside the response options', async () => {
    const { audio } = fakeAudio()
    const runner = new LevelRunner(level('t3-s1'), [stim(64)], { audio, rng: mulberry32(1) })
    void runner.run()
    await vi.advanceTimersByTimeAsync(LEAD)
    expect(runner.respond(0)).toBe(false) // C not in {E, F, F♯}
    expect(runner.respond(4)).toBe(true)
  })

  it('can be aborted mid-level', async () => {
    const { audio } = fakeAudio()
    const trials: RecordedTrial[] = []
    const runner = new LevelRunner(level('t3-s2'), [stim(64), stim(66)], {
      audio,
      rng: mulberry32(1),
      onTrial: (t) => void trials.push(t),
    })
    const done = runner.run()
    await vi.advanceTimersByTimeAsync(2000)
    runner.abort()
    await vi.advanceTimersByTimeAsync(20000)
    expect(await done).toBeNull()
    expect(runner.snapshot.phase).toBe('aborted')
    expect(trials).toHaveLength(0)
  })
})
