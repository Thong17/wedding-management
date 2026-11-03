from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.api import ClientDocumentViewSet, ClientViewSet, UserViewSet
from accounts.views import change_password, health, me
from events.views import EventViewSet, GuestViewSet, RoleViewSet, permission_catalog
from gifts.views import GiftSyncView, GiftViewSet

router = DefaultRouter()
router.register(r"events", EventViewSet, basename="event")
router.register(r"events/(?P<event_pk>\d+)/guests", GuestViewSet, basename="event-guest")
router.register(r"events/(?P<event_pk>\d+)/gifts", GiftViewSet, basename="event-gift")
router.register(r"clients", ClientViewSet, basename="client")
router.register(r"clients/(?P<client_pk>\d+)/documents", ClientDocumentViewSet, basename="client-document")
router.register(r"users", UserViewSet, basename="user")
router.register(r"roles", RoleViewSet, basename="role")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", me, name="me"),
    path("api/auth/password/", change_password, name="change-password"),
    path("api/permissions/", permission_catalog, name="permission-catalog"),
    path("api/gifts/sync/", GiftSyncView.as_view(), name="gift-sync"),
    path("api/", include(router.urls)),
]

# Public uploads (profile pictures) only. Client documents live in PRIVATE_MEDIA_ROOT and are never served here.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
