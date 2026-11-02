import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    /** Breadcrumb label; EVENT_CRUMB is replaced with the event's name. */
    crumb?: string
    /** Route name of the parent breadcrumb (and where the back button goes). */
    parent?: string
  }
}

export const EVENT_CRUMB = ':event'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/', name: 'events', component: () => import('@/views/EventsListView.vue'), meta: { crumb: 'Events' } },
    { path: '/events/new', name: 'event-new', component: () => import('@/views/EventFormView.vue'), meta: { crumb: 'New event', parent: 'events' } },
    { path: '/events/:id(\\d+)', name: 'event', component: () => import('@/views/EventDetailView.vue'), props: true, meta: { crumb: EVENT_CRUMB, parent: 'events' } },
    { path: '/events/:id(\\d+)/edit', name: 'event-edit', component: () => import('@/views/EventFormView.vue'), props: true, meta: { crumb: 'Edit', parent: 'event' } },
    { path: '/events/:id(\\d+)/desk', name: 'desk', component: () => import('@/views/GiftDeskView.vue'), props: true, meta: { crumb: 'Gift desk', parent: 'event' } },
    { path: '/events/:id(\\d+)/report', name: 'report', component: () => import('@/views/ReportView.vue'), props: true, meta: { crumb: 'Report', parent: 'event' } },
    { path: '/events/:id(\\d+)/qr', name: 'qr-sheet', component: () => import('@/views/GuestQrSheetView.vue'), props: true, meta: { crumb: 'Guest QR codes', parent: 'event' } },
    { path: '/sync', name: 'sync', component: () => import('@/views/SyncCenterView.vue'), meta: { crumb: 'Sync center', parent: 'events' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  // Uses the cached user, not token validity, so the desk keeps working offline.
  if (!to.meta.public && !auth.isLoggedIn) return { name: 'login', query: { next: to.fullPath } }
})

export default router
