"""Small helpers to set up clients, logins and assignments in tests."""

from django.contrib.auth import get_user_model

from accounts.models import Client, Profile
from events.models import DEFAULT_ROLE_NAME, EventAssignment, Role

User = get_user_model()
UserType = Profile.UserType


def make_client(name="Planner Co", **fields) -> Client:
    fields.setdefault("status", Client.Status.ACTIVE)
    return Client.objects.create(business_name=name, **fields)


def make_user(username, user_type=UserType.CUSTOMER, client=None, trial_ends_at=None, **fields):
    user = User.objects.create_user(username, password="pw-123456", **fields)
    Profile.objects.update_or_create(user=user, defaults={"user_type": user_type, "client": client, "trial_ends_at": trial_ends_at})
    user.refresh_from_db()
    return user


def make_client_admin(username, client):
    return make_user(username, UserType.CLIENT_ADMIN, client)


def make_platform_admin(username="root"):
    return User.objects.create_superuser(username, password="pw-123456")


def default_role() -> Role:
    # Created by the data migration; tests run on a migrated database.
    return Role.objects.get(client=None, name=DEFAULT_ROLE_NAME)


def assign(user, event, role=None, permissions=None) -> EventAssignment:
    """Assign `user` to `event` with `role`, or with a throwaway role holding exactly `permissions`."""
    if role is None:
        if permissions is None:
            role = default_role()
        else:
            role = Role.objects.create(name=f"r{Role.objects.count()}", client=event.client, permissions=sorted(permissions))
    return EventAssignment.objects.create(event=event, user=user, role=role)
