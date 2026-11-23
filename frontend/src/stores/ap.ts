import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { db, getStateDoc, putStateDoc, type TestResult } from '@/data/db'
import {
  buildLadder,
  buildTestSpec,
  DEFAULT_DEADLINE_MS,
  DEFAULT_PITCH_ORDER,
  type LevelSpec,
} from '@/ap/protocol'
import {
  applyLevelResult,
  initialProgress,
  pitchesMastered,
  type APProgress,
  type LevelTransition,
} from '@/ap/progress'
import { timbreConfig } from '@/ap/timbres'

const PROGRESS_KEY = 'ap_progress'

export const useApStore = defineStore('ap', () => {
  const timbres = timbreConfig()
  const ladder = buildLadder({
    pitchOrder: DEFAULT_PITCH_ORDER,
    trainedTimbres: timbres.trained,
    deadlineMs: DEFAULT_DEADLINE_MS,
  })

  const progress = ref<APProgress>(initialProgress())
  const tests = shallowRef<TestResult[]>([])
  const loaded = ref(false)

  const currentLevel = computed<LevelSpec | null>(() => ladder[progress.value.levelIndex] ?? null)
  const complete = computed(() => progress.value.levelIndex >= ladder.length)
  const mastered = computed(() => pitchesMastered(progress.value, ladder))
  const pretest = computed(() => tests.value.find((t) => t.kind === 'pretest') ?? null)

  async function load(): Promise<void> {
    const saved = await getStateDoc<APProgress>(db, PROGRESS_KEY)
    progress.value = saved?.schema === 1 ? saved : initialProgress()
    tests.value = await db.testResults.orderBy('takenAt').toArray()
    loaded.value = true
  }

  async function save(): Promise<void> {
    await putStateDoc(db, PROGRESS_KEY, JSON.parse(JSON.stringify(progress.value)) as APProgress)
  }

  async function finishOnboarding(): Promise<void> {
    progress.value = { ...progress.value, onboardingDone: true }
    await save()
  }

  async function recordLevelResult(passed: boolean): Promise<LevelTransition> {
    const r = applyLevelResult(progress.value, ladder, passed)
    progress.value = r.progress
    await save()
    return r.transition
  }

  async function refreshTests(): Promise<void> {
    tests.value = await db.testResults.orderBy('takenAt').toArray()
  }

  function testSpec(kind: TestResult['kind']): LevelSpec {
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
    loaded,
    currentLevel,
    complete,
    mastered,
    pretest,
    load,
    finishOnboarding,
    recordLevelResult,
    refreshTests,
    testSpec,
  }
})
