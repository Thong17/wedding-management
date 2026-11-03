"""Management API: clients (+ documents) and logins. See docs/accounts-plan.md for who may do what."""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, ProtectedError, Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from events import access

from .models import Client, ClientDocument, Profile
from .serializers import ClientDocumentSerializer, ClientSerializer, UserSerializer

User = get_user_model()
UserType = Profile.UserType


def _require_manager(user):
    """Platform admins and client admins only; customers have no management pages."""
    if not (access.is_platform_admin(user) or access.client_admin_of(user)):
        raise PermissionDenied("Only client admins and the platform admin can do this.")


def _require_platform_admin(user):
    if not access.is_platform_admin(user):
        raise PermissionDenied("Only the platform admin can do this.")


class ClientViewSet(viewsets.ModelViewSet):
    """Platform admin: every client, full control. Client admin: their own client, read-only."""

    serializer_class = ClientSerializer

    def get_queryset(self):
        user = self.request.user
        _require_manager(user)
        qs = Client.objects.annotate(
            admin_count=Count("profiles", filter=Q(profiles__user_type=UserType.CLIENT_ADMIN), distinct=True),
            customer_count=Count("profiles", filter=Q(profiles__user_type=UserType.CUSTOMER), distinct=True),
            event_count=Count("events", distinct=True),
            document_count=Count("documents", distinct=True),
        )
        if not access.is_platform_admin(user):
            qs = qs.filter(pk=access.client_admin_of(user))
        params = self.request.query_params
        if params.get("status"):
            qs = qs.filter(status=params["status"])
        if params.get("search"):
            s = params["search"]
            qs = qs.filter(Q(business_name__icontains=s) | Q(contact_name__icontains=s) | Q(phone__icontains=s) | Q(email__icontains=s))
        return qs

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            _require_platform_admin(request.user)

    def perform_destroy(self, instance):
        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError({"detail": "This client still has logins or events. Move or remove them first."})


class ClientDocumentViewSet(viewsets.ModelViewSet):
    """A client's documents. Platform admin: full control. That client's admins: view and download only."""

    serializer_class = ClientDocumentSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        user = request.user
        self.client_obj = get_object_or_404(Client, pk=self.kwargs["client_pk"])
        if not access.is_platform_admin(user):
            if access.client_admin_of(user) != self.client_obj.pk:
                raise PermissionDenied("You can't see this client's documents.")
            if request.method not in ("GET", "HEAD", "OPTIONS"):
                raise PermissionDenied("Only the platform admin can change documents.")

    def get_queryset(self):
        return ClientDocument.objects.filter(client=self.client_obj).select_related("uploaded_by")

    def perform_create(self, serializer):
        serializer.save(client=self.client_obj, uploaded_by=self.request.user)

    def perform_destroy(self, instance):
        instance.file.delete(save=False)
        instance.delete()

    @action(detail=True, methods=["get"])
    def download(self, request, *args, **kwargs):
        doc = self.get_object()
        response = FileResponse(doc.file.open("rb"), as_attachment=True, filename=doc.original_name or "document")
        response["Content-Type"] = doc.content_type or "application/octet-stream"
        # Sensitive: never cache (browser or service worker) and never sniff as something else.
        response["Cache-Control"] = "no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class UserViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                  mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Logins. Platform admin: everyone (edits client admins and customers). Client admin: their client's
    logins, editing only its customers. Logins are deactivated, never deleted, so recorded gifts keep their author."""

    serializer_class = UserSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def check_permissions(self, request):
        super().check_permissions(request)
        _require_manager(request.user)

    def get_queryset(self):
        user = self.request.user
        qs = User.objects.select_related("profile", "profile__client").annotate(
            assignment_count=Count("event_assignments", distinct=True)
        ).order_by("username")
        if not access.is_platform_admin(user):
            qs = qs.filter(profile__client_id=access.client_admin_of(user))
        params = self.request.query_params
        if params.get("client") == "none":
            qs = qs.filter(Q(profile__client__isnull=True) | Q(profile__isnull=True))
        elif params.get("client"):
            qs = qs.filter(profile__client_id=params["client"])
        if params.get("type"):
            qs = qs.filter(profile__user_type=params["type"])
        if params.get("active") in ("0", "1"):
            qs = qs.filter(is_active=params["active"] == "1")
        if params.get("search"):
            s = params["search"]
            qs = qs.filter(Q(username__icontains=s) | Q(first_name__icontains=s) | Q(last_name__icontains=s))
        return qs

    def _check_editable(self, target):
        actor = self.request.user
        if target.pk == actor.pk:
            raise PermissionDenied("Change your own login from your Profile page.")
        if access.is_platform_admin(target):
            raise PermissionDenied("Platform admins can't be changed here.")
        if not access.is_platform_admin(actor) and access.profile_of(target).user_type != UserType.CUSTOMER:
            raise PermissionDenied("Only the platform admin can change client admins.")

    def perform_update(self, serializer):
        self._check_editable(serializer.instance)
        serializer.save()

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        target = self.get_object()
        self._check_editable(target)
        password = request.data.get("password") or ""
        try:
            validate_password(password, target)
        except DjangoValidationError as exc:
            return Response({"password": exc.messages}, status=status.HTTP_400_BAD_REQUEST)
        target.set_password(password)
        target.save(update_fields=["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)
