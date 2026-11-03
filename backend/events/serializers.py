from django.contrib.auth import get_user_model
from rest_framework import serializers

from accounts.models import Client

from . import access
from .invite_qr import invite_qr_error
from .models import DEFAULT_ROLE_NAME, Event, EventAssignment, Guest, Role


class EventSerializer(serializers.ModelSerializer):
    # Kept for the current UI: "owner" = full access (client admin / platform admin), "manager" = assigned.
    role = serializers.SerializerMethodField()
    # What the signed-in user may do on this event (permission codes), for permission-aware screens.
    permissions = serializers.SerializerMethodField()
    full_access = serializers.SerializerMethodField()
    client = serializers.PrimaryKeyRelatedField(queryset=Client.objects.all(), required=False, allow_null=True)
    client_name = serializers.CharField(source="client.business_name", read_only=True, default=None)

    class Meta:
        model = Event
        fields = [
            "id", "name", "date", "venue", "currency", "invite_qr", "client", "client_name",
            "role", "permissions", "full_access", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def _perms(self, obj):
        request = self.context.get("request")
        if not request:
            return None
        cache = self.context.setdefault("_perm_cache", {})
        if obj.pk not in cache:
            cache[obj.pk] = access.event_permissions(request.user, obj)
        return cache[obj.pk]

    def get_full_access(self, obj):
        request = self.context.get("request")
        return bool(request) and access.has_full_access(request.user, obj)

    def get_role(self, obj):
        if self._perms(obj) is None:
            return None
        return "owner" if self.get_full_access(obj) else "manager"

    def get_permissions(self, obj):
        perms = self._perms(obj)
        return sorted(perms) if perms is not None else []

    def validate_client(self, value):
        # Only the platform admin picks the client; client admins' events always belong to their own client.
        request = self.context.get("request")
        if request and not access.is_platform_admin(request.user):
            raise serializers.ValidationError("Only the platform admin can choose the client.")
        return value

    def validate_currency(self, value):
        value = value.upper()
        if len(value) != 3 or not value.isalpha():
            raise serializers.ValidationError("Use a 3-letter ISO currency code.")
        return value

    def validate_invite_qr(self, value):
        error = invite_qr_error(value)
        if error:
            raise serializers.ValidationError(error)
        return value.strip()


class AssignmentSerializer(serializers.ModelSerializer):
    """A customer on an event with a role. `role` stays "manager" for the current Managers tab."""

    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    role = serializers.SerializerMethodField()
    role_id = serializers.IntegerField(source="role.id", read_only=True)
    role_name = serializers.CharField(source="role.name", read_only=True)
    permissions = serializers.JSONField(source="role.permissions", read_only=True)

    class Meta:
        model = EventAssignment
        fields = ["id", "user_id", "username", "role", "role_id", "role_name", "permissions", "created_at"]

    def get_role(self, obj):
        return "manager"


class AssignSerializer(serializers.Serializer):
    """Assign a customer (by username or id) to an event with a role (default: the global Default role)."""

    username = serializers.CharField(required=False)
    user_id = serializers.IntegerField(required=False)
    role_id = serializers.IntegerField(required=False)
    # Old Managers tab sends role="owner"/"manager"; owners are now client admins, so only "manager" is allowed.
    role = serializers.ChoiceField(choices=["manager", "owner"], required=False)

    def validate(self, attrs):
        event, actor = self.context["event"], self.context["request"].user
        if attrs.get("role") == "owner":
            raise serializers.ValidationError(
                {"role": "Full access now comes from being a client admin; assign customers with a role instead."}
            )
        User = get_user_model()
        lookup = {"pk": attrs["user_id"]} if attrs.get("user_id") else {"username": attrs.get("username", "")}
        user = User.objects.filter(**lookup).first()
        if user is None:
            raise serializers.ValidationError({"username": "No user with that username."})
        if not User.objects.filter(access.assignable_users_q(actor, event), pk=user.pk).exists():
            raise serializers.ValidationError(
                {"username": "Only active customers can be assigned, and client admins can only assign their own customers."}
            )
        roles = Role.objects.filter(access.usable_roles_q(event))
        role = roles.filter(pk=attrs["role_id"]).first() if attrs.get("role_id") else roles.filter(
            client__isnull=True, name=DEFAULT_ROLE_NAME
        ).first()
        if role is None:
            raise serializers.ValidationError({"role_id": "Choose a global role or one of this client's roles."})
        return {"user": user, "role": role}


class GuestSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guest
        fields = [
            "id",
            "event",
            "full_name",
            "nickname",
            "phone",
            "side",
            "group",
            "table_no",
            "qr_token",
            "is_deleted",
            "updated_at",
        ]
        read_only_fields = ["id", "event", "qr_token", "is_deleted", "updated_at"]

    def validate_full_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name is required.")
        return value


class RoleSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.business_name", read_only=True, default=None)
    usage_count = serializers.IntegerField(read_only=True, default=0)
    updated_by_username = serializers.CharField(source="updated_by.username", read_only=True, default=None)
    editable = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = [
            "id", "name", "client", "client_name", "permissions", "usage_count",
            "updated_by_username", "updated_at", "editable",
        ]
        read_only_fields = ["id", "updated_at"]

    def get_editable(self, obj):
        user = self.context["request"].user
        return access.is_platform_admin(user) or (obj.client_id is not None and obj.client_id == access.client_admin_of(user))

    def validate_permissions(self, value):
        if not isinstance(value, list) or not all(isinstance(p, str) for p in value):
            raise serializers.ValidationError("Send a list of permission codes.")
        unknown = sorted(set(value) - access.ALL_PERMISSIONS)
        if unknown:
            raise serializers.ValidationError(f"Unknown permissions: {', '.join(unknown)}.")
        return sorted(set(value))

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Give the role a name.")
        return value

    def validate_client(self, value):
        user = self.context["request"].user
        if self.instance is not None and value != self.instance.client:
            raise serializers.ValidationError("A role can't be moved to another client.")
        if not access.is_platform_admin(user) and value is not None and value.pk != access.client_admin_of(user):
            raise serializers.ValidationError("You can only create roles for your own client.")
        return value

    def validate(self, attrs):
        user = self.context["request"].user
        if self.instance is not None:
            client_id = self.instance.client_id
        elif access.is_platform_admin(user):
            client_id = attrs["client"].pk if attrs.get("client") else None
        else:
            client_id = access.client_admin_of(user)  # a client admin's new role is always their client's
        name = attrs.get("name", self.instance.name if self.instance else "")
        clash = Role.objects.filter(client_id=client_id, name__iexact=name)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError({"name": "A role with this name already exists here."})
        return attrs
