import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    /** Breadcrumb i18n key; EVENT_CRUMB is replaced with the event's name. */
    crumb?: string
    /** Route name of the parent breadcrumb (and where the back button goes). */
    parent?: string
    /** Only platform admins and client admins (others are sent to the events list). */
    managers?: boolean
  }
}

export const EVENT_CRUMB = ':event'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/', name: 'events', component: () => import('@/views/EventsListView.vue'), meta: { crumb: 'crumb.events' } },
    { path: '/events/new', name: 'event-new', component: () => import('@/views/EventFormView.vue'), meta: { crumb: 'crumb.newEvent', parent: 'events', managers: true } },
    { path: '/events/:id(\\d+)', name: 'event', component: () => import('@/views/EventDetailView.vue'), props: true, meta: { crumb: EVENT_CRUMB, parent: 'events' } },
    { path: '/events/:id(\\d+)/edit', name: 'event-edit', component: () => import('@/views/EventFormView.vue'), props: true, meta: { crumb: 'crumb.edit', parent: 'event' } },
    { path: '/events/:id(\\d+)/desk', name: 'desk', component: () => import('@/views/GiftDeskView.vue'), props: true, meta: { crumb: 'crumb.desk', parent: 'event' } },
    { path: '/events/:id(\\d+)/report', name: 'report', component: () => import('@/views/ReportView.vue'), props: true, meta: { crumb: 'crumb.report', parent: 'event' } },
    { path: '/events/:id(\\d+)/qr', name: 'qr-sheet', component: () => import('@/views/GuestQrSheetView.vue'), props: true, meta: { crumb: 'crumb.qr', parent: 'event' } },
    { path: '/sync', name: 'sync', component: () => import('@/views/SyncCenterView.vue'), meta: { crumb: 'crumb.sync', parent: 'events' } },
    { path: '/roles', name: 'roles', component: () => import('@/views/RolesView.vue'), meta: { crumb: 'crumb.roles', parent: 'events', managers: true } },
    { path: '/profile', name: 'profile', component: () => import('@/views/ProfileView.vue'), meta: { crumb: 'crumb.profile', parent: 'events' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  // Uses the cached user, not token validity, so the desk keeps working offline.
  if (!to.meta.public && !auth.isLoggedIn) return { name: 'login', query: { next: to.fullPath } }
  if (to.meta.managers && !auth.isManager) return { name: 'events' }
})

export default router
