from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.views import health, me
from events.views import EventViewSet, GuestViewSet
from gifts.views import GiftSyncView, GiftViewSet

router = DefaultRouter()
router.register(r"events", EventViewSet, basename="event")
router.register(r"events/(?P<event_pk>\d+)/guests", GuestViewSet, basename="event-guest")
router.register(r"events/(?P<event_pk>\d+)/gifts", GiftViewSet, basename="event-gift")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", me, name="me"),
    path("api/gifts/sync/", GiftSyncView.as_view(), name="gift-sync"),
    path("api/", include(router.urls)),
]
