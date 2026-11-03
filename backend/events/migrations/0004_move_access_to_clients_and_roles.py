"""Move existing data into the client / customer / role model (docs/accounts-plan.md).

- A global "Default" role is created (gift desk + add, edit, delete and import guests).
- Superusers become platform admins.
- If there is any other user or any event, one client "Existing data" is created, set to Active so nobody
  is locked out. Event creators become its client admins; everyone else becomes its customers.
- Every existing event belongs to that client.
- Each customer's old Owner/Manager membership becomes an assignment with the Default role. Client admins
  and platform admins need no assignment: they have full access to the client's events.
"""

from django.db import migrations

DEFAULT_ROLE_NAME = "Default"
DEFAULT_ROLE_PERMISSIONS = ["gift_desk", "guest_add", "guest_edit", "guest_delete", "guest_import"]


def forwards(apps, schema_editor):
    User = apps.get_model("auth", "User")
    Profile = apps.get_model("accounts", "Profile")
    Client = apps.get_model("accounts", "Client")
    Event = apps.get_model("events", "Event")
    Membership = apps.get_model("events", "EventMembership")
    Role = apps.get_model("events", "Role")
    Assignment = apps.get_model("events", "EventAssignment")

    default_role, _ = Role.objects.get_or_create(
        client=None, name=DEFAULT_ROLE_NAME, defaults={"permissions": DEFAULT_ROLE_PERMISSIONS}
    )

    regular_users = User.objects.filter(is_superuser=False)
    client = None
    if regular_users.exists() or Event.objects.exists():
        client = Client.objects.create(business_name="Existing data", status="active")

    creator_ids = set(Event.objects.values_list("created_by_id", flat=True))
    for user in User.objects.all():
        profile, _ = Profile.objects.get_or_create(user=user)
        if user.is_superuser:
            profile.user_type, profile.client = "platform_admin", None
        elif user.id in creator_ids:
            profile.user_type, profile.client = "client_admin", client
        else:
            profile.user_type, profile.client = "customer", client
        profile.save(update_fields=["user_type", "client"])

    if client:
        Event.objects.update(client=client)

    customer_ids = set(Profile.objects.filter(user_type="customer").values_list("user_id", flat=True))
    for m in Membership.objects.filter(user_id__in=customer_ids):
        Assignment.objects.get_or_create(event_id=m.event_id, user_id=m.user_id, defaults={"role": default_role})


def backwards(apps, schema_editor):
    """Rebuild memberships so the previous code still works: full-access users as owners, assignments as managers."""
    Profile = apps.get_model("accounts", "Profile")
    Event = apps.get_model("events", "Event")
    Membership = apps.get_model("events", "EventMembership")
    Assignment = apps.get_model("events", "EventAssignment")

    for a in Assignment.objects.all():
        Membership.objects.get_or_create(event_id=a.event_id, user_id=a.user_id, defaults={"role": "manager"})
    for event in Event.objects.all():
        Membership.objects.get_or_create(event_id=event.id, user_id=event.created_by_id, defaults={"role": "owner"})
        if event.client_id:
            admin_ids = Profile.objects.filter(user_type="client_admin", client_id=event.client_id).values_list("user_id", flat=True)
            for uid in admin_ids:
                Membership.objects.update_or_create(event_id=event.id, user_id=uid, defaults={"role": "owner"})


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_client_clientdocument_profile_trial_ends_at_and_more"),
        ("events", "0003_event_client_role_eventassignment_and_more"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]
