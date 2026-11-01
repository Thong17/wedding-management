from rest_framework import permissions

from .models import EventMembership


def is_member(user, event_id) -> bool:
    return EventMembership.objects.filter(user=user, event_id=event_id).exists()


def is_owner(user, event_id) -> bool:
    return EventMembership.objects.filter(
        user=user, event_id=event_id, role=EventMembership.Role.OWNER
    ).exists()


class IsEventMember(permissions.BasePermission):
    """Grants access to event-scoped routes (`event_pk` in URL) for members only.

    Write operations on the event itself (update/delete/members) require owner role.
    """

    def has_permission(self, request, view):
        event_id = view.kwargs.get("event_pk")
        if event_id is None:
            return True
        return is_member(request.user, event_id)


class IsEventOwnerOrReadOnly(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return is_member(request.user, obj.pk)
        return is_owner(request.user, obj.pk)
