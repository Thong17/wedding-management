"""Who may see and do what — the single source of the access rules (docs/accounts-plan.md).

- Platform admin: everything, never locked.
- Client admin: full access to their client's events; manages that client's customers and roles.
- Customer: only events they are assigned to, with the permissions of the assigned role.
- A login is locked when its client is suspended or past its trial, or (standalone customers) when its own
  date has passed. Locked logins may only read /me and upload already-recorded gifts.
"""

from django.db.models import Q, QuerySet
from django.http import Http404
from django.utils import timezone
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied

from accounts.models import Profile

from .models import Event, EventAssignment, Permission

ALL_PERMISSIONS = frozenset(Permission.values)
UserType = Profile.UserType


def profile_of(user) -> Profile:
    """The user's profile, created on first use (users made before profiles existed, or via createsuperuser)."""
    try:
        return user.profile
    except Profile.DoesNotExist:
        user_type = UserType.PLATFORM_ADMIN if user.is_superuser else UserType.CUSTOMER
        profile, _ = Profile.objects.get_or_create(user=user, defaults={"user_type": user_type})
        user.profile = profile
        return profile


def is_platform_admin(user) -> bool:
    return user.is_authenticated and (user.is_superuser or profile_of(user).user_type == UserType.PLATFORM_ADMIN)


def client_admin_of(user):
    """The client id this user administers, or None."""
    if not user.is_authenticated or is_platform_admin(user):
        return None
    p = profile_of(user)
    return p.client_id if p.user_type == UserType.CLIENT_ADMIN else None


def lock_reason(user, today=None):
    """Why this login is locked ('suspended' / 'trial_ended'), or None."""
    if not user.is_authenticated or is_platform_admin(user):
        return None
    p = profile_of(user)
    if p.client_id:
        return p.client.lock_reason(today)
    today = today or timezone.localdate()
    if p.trial_ends_at and today > p.trial_ends_at:
        return "trial_ended"
    return None


# --- Events ----------------------------------------------------------------------------------------


def visible_events(user) -> QuerySet:
    if is_platform_admin(user):
        return Event.objects.all()
    client_id = client_admin_of(user)
    if client_id:
        return Event.objects.filter(client_id=client_id)
    return Event.objects.filter(assignments__user=user).distinct()


def has_full_access(user, event: Event) -> bool:
    """Edit/delete the event, assign people, and every permission."""
    if is_platform_admin(user):
        return True
    client_id = client_admin_of(user)
    return client_id is not None and event.client_id == client_id


def event_permissions(user, event: Event) -> frozenset | None:
    """The permission codes this user has on the event, or None if they can't see it at all."""
    if has_full_access(user, event):
        return ALL_PERMISSIONS
    assignment = EventAssignment.objects.filter(event=event, user=user).select_related("role").first()
    if assignment is None:
        return None
    return frozenset(assignment.role.permissions) & ALL_PERMISSIONS


def can_create_events(user) -> bool:
    return is_platform_admin(user) or client_admin_of(user) is not None


def event_ids_with(user, permission: str) -> set[int]:
    """Events where the user has `permission` (used by gift sync, which spans events)."""
    if is_platform_admin(user):
        return set(Event.objects.values_list("id", flat=True))
    client_id = client_admin_of(user)
    if client_id:
        return set(Event.objects.filter(client_id=client_id).values_list("id", flat=True))
    rows = EventAssignment.objects.filter(user=user).values_list("event_id", "role__permissions")
    return {event_id for event_id, perms in rows if permission in (perms or [])}


def assignable_users_q(actor, event: Event) -> Q:
    """Which users `actor` may assign to `event`: customers only — any customer for the platform admin,
    the event's own client's customers for a client admin."""
    q = Q(profile__user_type=UserType.CUSTOMER, is_active=True)
    if is_platform_admin(actor):
        return q
    return q & Q(profile__client_id=event.client_id)


def usable_roles_q(event: Event) -> Q:
    """Roles that can be given on this event: global ones, or the event's client's own."""
    return Q(client__isnull=True) | Q(client_id=event.client_id)


# --- DRF permission classes --------------------------------------------------------------------------


class NotLocked(permissions.BasePermission):
    """Refuse locked logins. Views that must keep working when locked (gift upload) leave this out."""

    message = "This account is locked."

    def has_permission(self, request, view):
        reason = lock_reason(request.user)
        if reason:
            raise PermissionDenied({"detail": self.message, "code": "account_locked", "reason": reason})
        return True


class NotLockedUnlessSafe(NotLocked):
    """Locked logins may still read (e.g. GET /me, to show the lock screen)."""

    def has_permission(self, request, view):
        return request.method in permissions.SAFE_METHODS or super().has_permission(request, view)


def require(user, event: Event, *, full=False, permission=None, any_of=()):
    """Raise 403/404 unless the user may do this on the event. Hidden events look like missing ones."""
    perms = event_permissions(user, event)
    if perms is None:
        raise Http404
    if full and not has_full_access(user, event):
        raise PermissionDenied("Only the event's client admins can do this.")
    if permission and permission not in perms:
        raise PermissionDenied(f"Your role on this event doesn't allow: {Permission(permission).label}.")
    if any_of and not perms.intersection(any_of):
        raise PermissionDenied("Your role on this event doesn't allow this.")
    return perms
