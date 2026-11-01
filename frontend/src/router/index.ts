import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/', name: 'events', component: () => import('@/views/EventsListView.vue') },
    { path: '/events/new', name: 'event-new', component: () => import('@/views/EventFormView.vue') },
    { path: '/events/:id(\\d+)', name: 'event', component: () => import('@/views/EventDetailView.vue'), props: true },
    { path: '/events/:id(\\d+)/edit', name: 'event-edit', component: () => import('@/views/EventFormView.vue'), props: true },
    { path: '/events/:id(\\d+)/desk', name: 'desk', component: () => import('@/views/GiftDeskView.vue'), props: true },
    { path: '/events/:id(\\d+)/report', name: 'report', component: () => import('@/views/ReportView.vue'), props: true },
    { path: '/events/:id(\\d+)/qr', name: 'qr-sheet', component: () => import('@/views/GuestQrSheetView.vue'), props: true },
    { path: '/sync', name: 'sync', component: () => import('@/views/SyncCenterView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  // Uses the cached user, not token validity, so the desk keeps working offline.
  if (!to.meta.public && !auth.isLoggedIn) return { name: 'login', query: { next: to.fullPath } }
})

export default router
