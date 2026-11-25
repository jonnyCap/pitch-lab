import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/trainer', name: 'trainer', component: () => import('@/views/TrainerView.vue') },
    {
      path: '/test/:kind(pretest|weekly|posttest|retention_1m|retention_3m)',
      name: 'test',
      component: () => import('@/views/TestView.vue'),
      props: true,
    },
    { path: '/learn', name: 'learn', component: () => import('@/views/LearnView.vue') },
    { path: '/learn/rhythm', name: 'rhythm', component: () => import('@/views/RhythmView.vue') },
    {
      path: '/learn/lesson/:id',
      name: 'lesson',
      component: () => import('@/views/LessonView.vue'),
      props: true,
    },
    {
      path: '/learn/practice/:deck(keyboard|treble|bass|staff-keys|ear-intervals|sight-intervals|key-signatures|scales-sight|scales-ear|chords-sight|inversions|chords-ear|note-values)',
      name: 'practice',
      component: () => import('@/views/PracticeView.vue'),
      props: true,
    },
    { path: '/progress', name: 'progress', component: () => import('@/views/ProgressView.vue') },
    {
      path: '/pitch-memory',
      name: 'pitch-memory',
      component: () => import('@/views/PitchMemoryView.vue'),
    },
    {
      path: '/audio-check',
      name: 'audio-check',
      component: () => import('@/views/AudioCheckView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
