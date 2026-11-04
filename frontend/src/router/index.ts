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
    platformAdmin?: boolean
    clientAdmin?: boolean
  }
}

export const EVENT_CRUMB = ':event'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/', name: 'events', component: () => import('@/views/EventsListView.vue'), meta: { crumb: 'crumb.events' } },
    // New / edit event are dialogs now; old links land on the page that opens them.
    { path: '/events/new', redirect: { name: 'events' } },
    { path: '/events/:id(\\d+)', name: 'event', component: () => import('@/views/EventDetailView.vue'), props: true, meta: { crumb: EVENT_CRUMB, parent: 'events' } },
    { path: '/events/:id(\\d+)/edit', redirect: (to) => ({ name: 'event', params: { id: to.params.id } }) },
    { path: '/events/:id(\\d+)/desk', name: 'desk', component: () => import('@/views/GiftDeskView.vue'), props: true, meta: { crumb: 'crumb.desk', parent: 'event' } },
    { path: '/events/:id(\\d+)/report', name: 'report', component: () => import('@/views/ReportView.vue'), props: true, meta: { crumb: 'crumb.report', parent: 'event' } },
    { path: '/events/:id(\\d+)/qr', name: 'qr-sheet', component: () => import('@/views/GuestQrSheetView.vue'), props: true, meta: { crumb: 'crumb.qr', parent: 'event' } },
    { path: '/sync', name: 'sync', component: () => import('@/views/SyncCenterView.vue'), meta: { crumb: 'crumb.sync', parent: 'events' } },
    { path: '/clients', name: 'clients', component: () => import('@/views/ClientsView.vue'), meta: { crumb: 'crumb.clients', parent: 'events', platformAdmin: true } },
    { path: '/clients/:id(\\d+)', name: 'client', component: () => import('@/views/ClientDetailView.vue'), props: true, meta: { crumb: 'crumb.client', parent: 'clients', platformAdmin: true } },
    { path: '/users', name: 'users', component: () => import('@/views/UsersView.vue'), meta: { crumb: 'crumb.users', parent: 'events', platformAdmin: true } },
    { path: '/customers', name: 'customers', component: () => import('@/views/CustomersView.vue'), meta: { crumb: 'crumb.customers', parent: 'events', clientAdmin: true } },
    { path: '/business', name: 'business', component: () => import('@/views/BusinessProfileView.vue'), meta: { crumb: 'crumb.business', parent: 'events', clientAdmin: true } },
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
  if (to.meta.platformAdmin && !auth.isPlatformAdmin) return { name: 'events' }
  if (to.meta.clientAdmin && !auth.isClientAdmin) return { name: 'events' }
})

export default router
