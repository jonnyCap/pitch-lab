import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    {
      path: '/trainer',
      name: 'trainer',
      component: () => import('@/views/ComingSoonView.vue'),
      props: { title: 'Absolute pitch trainer', milestone: 'M1' },
    },
    {
      path: '/learn',
      name: 'learn',
      component: () => import('@/views/ComingSoonView.vue'),
      props: { title: 'Music fundamentals', milestone: 'M3' },
    },
    {
      path: '/progress',
      name: 'progress',
      component: () => import('@/views/ComingSoonView.vue'),
      props: { title: 'Progress', milestone: 'M1' },
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
