from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from events import access

from .models import Client, ClientDocument, Profile

User = get_user_model()
UserType = Profile.UserType


def default_trial_end():
    return timezone.localdate() + timedelta(days=settings.DEFAULT_TRIAL_DAYS)


class ClientSerializer(serializers.ModelSerializer):
    lock_reason = serializers.SerializerMethodField()
    admin_count = serializers.IntegerField(read_only=True, default=0)
    customer_count = serializers.IntegerField(read_only=True, default=0)
    event_count = serializers.IntegerField(read_only=True, default=0)
    document_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Client
        fields = [
            "id", "business_name", "contact_name", "phone", "email", "address",
            "status", "trial_ends_at", "subscription_price", "subscription_currency", "billing_period",
            "subscription_start", "notes", "lock_reason",
            "admin_count", "customer_count", "event_count", "document_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_lock_reason(self, obj):
        return obj.lock_reason()

    def validate_subscription_currency(self, value):
        value = value.upper()
        if len(value) != 3 or not value.isalpha():
            raise serializers.ValidationError("Use a 3-letter ISO currency code.")
        return value

    def create(self, validated_data):
        # A new client on trial gets the default trial length unless a date is given.
        if validated_data.get("status", Client.Status.TRIAL) == Client.Status.TRIAL:
            validated_data.setdefault("trial_ends_at", default_trial_end())
        return super().create(validated_data)


# Leading bytes of accepted document formats → content type. Checked against content, not the file name.
DOCUMENT_SIGNATURES = [
    (b"%PDF-", "application/pdf"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
]
DOCUMENT_MAX_BYTES = 10 * 1024 * 1024


def sniff_document(upload):
    head = upload.read(12)
    upload.seek(0)
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return next((ctype for sig, ctype in DOCUMENT_SIGNATURES if head.startswith(sig)), None)


class ClientDocumentSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True, required=False)
    uploaded_by_username = serializers.CharField(source="uploaded_by.username", read_only=True, default=None)
    size = serializers.SerializerMethodField()

    class Meta:
        model = ClientDocument
        fields = [
            "id", "client", "doc_type", "number", "issued_on", "expires_on", "notes",
            "file", "original_name", "content_type", "size", "uploaded_by_username", "uploaded_at",
        ]
        read_only_fields = ["id", "client", "original_name", "content_type", "uploaded_at"]

    def get_size(self, obj):
        try:
            return obj.file.size
        except (FileNotFoundError, ValueError):
            return None

    def validate_file(self, upload):
        if upload.size > DOCUMENT_MAX_BYTES:
            raise serializers.ValidationError("The file must be 10 MB or smaller.")
        ctype = sniff_document(upload)
        if ctype is None:
            raise serializers.ValidationError("Upload a PDF, JPEG, PNG or WebP file.")
        upload.sniffed_type = ctype
        return upload

    def validate(self, attrs):
        if self.instance is None and "file" not in attrs:
            raise serializers.ValidationError({"file": "Choose a file to upload."})
        issued, expires = attrs.get("issued_on"), attrs.get("expires_on")
        if issued and expires and expires < issued:
            raise serializers.ValidationError({"expires_on": "The expiry date is before the issue date."})
        return attrs

    def _apply_file(self, validated_data):
        upload = validated_data.get("file")
        if upload is not None:
            validated_data["original_name"] = upload.name[:255]
            validated_data["content_type"] = upload.sniffed_type

    def create(self, validated_data):
        self._apply_file(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self._apply_file(validated_data)
        old = instance.file if "file" in validated_data else None
        instance = super().update(instance, validated_data)
        if old:
            old.storage.delete(old.name)
        return instance


class UserSerializer(serializers.ModelSerializer):
    """A login as the management pages see it. Writes are checked by UserViewSet against the actor."""

    user_type = serializers.ChoiceField(choices=[UserType.CLIENT_ADMIN, UserType.CUSTOMER], source="profile.user_type", required=False)
    client = serializers.PrimaryKeyRelatedField(source="profile.client", queryset=Client.objects.all(), allow_null=True, required=False)
    client_name = serializers.CharField(source="profile.client.business_name", read_only=True, default=None)
    trial_ends_at = serializers.DateField(source="profile.trial_ends_at", allow_null=True, required=False)
    password = serializers.CharField(write_only=True, required=False, style={"input_type": "password"})
    lock_reason = serializers.SerializerMethodField()
    is_platform_admin = serializers.SerializerMethodField()
    assignment_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = User
        fields = [
            "id", "username", "first_name", "last_name", "is_active", "user_type", "client", "client_name",
            "trial_ends_at", "password", "lock_reason", "is_platform_admin", "assignment_count",
            "last_login", "date_joined",
        ]
        read_only_fields = ["id", "last_login", "date_joined"]

    def get_lock_reason(self, obj):
        return access.lock_reason(obj)

    def get_is_platform_admin(self, obj):
        return access.is_platform_admin(obj)

    def validate_username(self, value):
        from .views import username_errors

        value = value.strip()
        problems = username_errors(value, self.instance)
        if problems:
            raise serializers.ValidationError(problems)
        return value

    def validate(self, attrs):
        actor = self.context["request"].user
        profile_data = attrs.get("profile", {})
        current = access.profile_of(self.instance) if self.instance else None

        if access.is_platform_admin(actor):
            user_type = profile_data.get("user_type", current.user_type if current else UserType.CUSTOMER)
            client = profile_data.get("client", current.client if current else None)
            if user_type == UserType.CLIENT_ADMIN and client is None:
                raise serializers.ValidationError({"client": "A client admin must belong to a client."})
            # Only standalone customers have their own access date; others follow their client.
            if client is not None and profile_data.get("trial_ends_at"):
                raise serializers.ValidationError({"trial_ends_at": "Logins under a client follow the client's trial."})
            if client is not None:
                profile_data["trial_ends_at"] = None
            elif self.instance is None:
                profile_data.setdefault("trial_ends_at", default_trial_end())
        else:
            # Client admins only manage customers of their own client, and can't set dates or types.
            for key in ("user_type", "client", "trial_ends_at"):
                if key in profile_data:
                    raise serializers.ValidationError({key: "Only the platform admin can change this."})
            profile_data.update(user_type=UserType.CUSTOMER, client_id=access.client_admin_of(actor))

        if self.instance is None:
            if not attrs.get("password"):
                raise serializers.ValidationError({"password": "Set a starting password."})
        if attrs.get("password"):
            try:
                validate_password(attrs["password"], self.instance)
            except DjangoValidationError as exc:
                raise serializers.ValidationError({"password": exc.messages})
        attrs["profile"] = profile_data
        return attrs

    def _save_profile(self, user, profile_data):
        profile = access.profile_of(user)
        client_id = profile_data.pop("client_id", None)
        for key, value in profile_data.items():
            setattr(profile, key, value)
        if client_id is not None:
            profile.client_id = client_id
        profile.save()
        user.profile = profile

    def create(self, validated_data):
        profile_data = validated_data.pop("profile")
        password = validated_data.pop("password")
        user = User.objects.create_user(password=password, **validated_data)
        self._save_profile(user, profile_data)
        return user

    def update(self, instance, validated_data):
        profile_data = validated_data.pop("profile")
        password = validated_data.pop("password", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()
        self._save_profile(instance, profile_data)
        return instance
