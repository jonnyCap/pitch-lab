import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import {
  db,
  getStateDoc,
  putStateDoc,
  type TestKind,
  type TestResult,
  type TrainingSession,
} from '@/data/db'
import {
  buildDrillSpec,
  buildLadder,
  buildTestSpec,
  DEFAULT_DEADLINE_MS,
  DEFAULT_PITCH_ORDER,
  type LevelSpec,
} from '@/ap/protocol'
import {
  applyLevelResult,
  canStart,
  completeDrill as completeDrillReducer,
  normalizeProgress,
  pitchesMastered,
  type APProgress,
  type LevelTransition,
} from '@/ap/progress'
import { confusionPartners, weakestPitch } from '@/ap/adaptive'
import { recentTrainingTrials } from '@/ap/persistence'
import { dueTests, scheduledTests } from '@/ap/schedule'
import { timbreConfig } from '@/ap/timbres'
import type { LevelSummary } from '@/ap/scoring'

const PROGRESS_KEY = 'ap_progress'

export const useApStore = defineStore('ap', () => {
  const timbres = timbreConfig()
  const ladder = buildLadder({
    pitchOrder: DEFAULT_PITCH_ORDER,
    trainedTimbres: timbres.trained,
    deadlineMs: DEFAULT_DEADLINE_MS,
  })

  const progress = ref<APProgress>(normalizeProgress(undefined))
  const tests = shallowRef<TestResult[]>([])
  const sessions = shallowRef<TrainingSession[]>([])
  const loaded = ref(false)

  // Coarse clock for time-based rules (12 h mastery gap, due tests).
  const now = ref(Date.now())
  const timer = setInterval(() => (now.value = Date.now()), 30_000)
  onScopeDispose(() => clearInterval(timer))

  const currentLevel = computed<LevelSpec | null>(() => ladder[progress.value.levelIndex] ?? null)
  const complete = computed(() => progress.value.levelIndex >= ladder.length)
  const mastered = computed(() => pitchesMastered(progress.value, ladder))
  const pretest = computed(() => tests.value.find((t) => t.kind === 'pretest') ?? null)
  const startGate = computed(() =>
    currentLevel.value
      ? canStart(progress.value, currentLevel.value, now.value)
      : { ok: true as const },
  )
  const due = computed(() => dueTests(progress.value, tests.value, now.value))
  const upcoming = computed(() => scheduledTests(progress.value, tests.value))

  async function load(): Promise<void> {
    progress.value = normalizeProgress(await getStateDoc<Partial<APProgress>>(db, PROGRESS_KEY))
    await Promise.all([refreshTests(), refreshSessions()])
    loaded.value = true
  }

  async function save(): Promise<void> {
    await putStateDoc(db, PROGRESS_KEY, JSON.parse(JSON.stringify(progress.value)) as APProgress)
  }

  async function finishOnboarding(): Promise<void> {
    progress.value = { ...progress.value, onboardingDone: true }
    await save()
  }

  async function recordLevelResult(summary: LevelSummary): Promise<LevelTransition> {
    const r = applyLevelResult(progress.value, ladder, {
      passed: summary.passed,
      points: summary.points,
      now: Date.now(),
    })
    progress.value = r.progress
    await Promise.all([save(), refreshSessions()])
    return r.transition
  }

  /** Builds the focus drill from the last ~10 levels of answers. */
  async function prepareDrill(): Promise<LevelSpec | null> {
    const level = currentLevel.value ?? ladder.at(-1)!
    const recent = await recentTrainingTrials(db, 300)
    const set = level.pitchSet
    const focus = weakestPitch(recent, set)
    return buildDrillSpec(level, focus, confusionPartners(recent, set)[focus] ?? [])
  }

  async function completeDrill(summary: LevelSummary): Promise<void> {
    progress.value = completeDrillReducer(progress.value, summary.points)
    await Promise.all([save(), refreshSessions()])
  }

  async function refreshTests(): Promise<void> {
    tests.value = await db.testResults.orderBy('takenAt').toArray()
  }

  async function refreshSessions(): Promise<void> {
    sessions.value = await db.sessions.where('module').equals('ap').toArray()
    now.value = Date.now()
  }

  function testSpec(kind: TestKind): LevelSpec {
    return buildTestSpec({
      trainedTimbre: timbres.trained[0]!,
      untrainedTimbre: timbres.untrained,
      kind,
    })
  }

  return {
    timbres,
    ladder,
    progress,
    tests,
    sessions,
    loaded,
    now,
    currentLevel,
    complete,
    mastered,
    pretest,
    startGate,
    due,
    upcoming,
    load,
    finishOnboarding,
    recordLevelResult,
    prepareDrill,
    completeDrill,
    refreshTests,
    refreshSessions,
    testSpec,
  }
})
