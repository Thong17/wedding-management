from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Event, EventMembership, Guest


class EventSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = ["id", "name", "date", "venue", "currency", "role", "created_at", "updated_at"]
        read_only_fields = ["id", "role", "created_at", "updated_at"]

    def get_role(self, obj):
        request = self.context.get("request")
        if not request:
            return None
        membership = next(
            (m for m in obj.memberships.all() if m.user_id == request.user.id), None
        )
        return membership.role if membership else None

    def validate_currency(self, value):
        value = value.upper()
        if len(value) != 3 or not value.isalpha():
            raise serializers.ValidationError("Use a 3-letter ISO currency code.")
        return value


class MembershipSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    user_id = serializers.IntegerField(source="user.id", read_only=True)

    class Meta:
        model = EventMembership
        fields = ["id", "user_id", "username", "role", "created_at"]
        read_only_fields = ["id", "user_id", "username", "created_at"]


class AddMemberSerializer(serializers.Serializer):
    username = serializers.CharField()
    role = serializers.ChoiceField(choices=EventMembership.Role.choices, default="manager")

    def validate_username(self, value):
        User = get_user_model()
        try:
            return User.objects.get(username=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("No user with that username.")


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
