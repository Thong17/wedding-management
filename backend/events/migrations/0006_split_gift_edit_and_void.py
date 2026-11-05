""""Edit & void gifts" (gift_edit) is now two permissions: edit any gift (gift_edit) and void any gift
(gift_void). Roles that had it keep both."""

from django.db import migrations


def forwards(apps, schema_editor):
    Role = apps.get_model("events", "Role")
    for role in Role.objects.all():
        if "gift_edit" in role.permissions and "gift_void" not in role.permissions:
            role.permissions = [*role.permissions, "gift_void"]
            role.save(update_fields=["permissions"])


def backwards(apps, schema_editor):
    Role = apps.get_model("events", "Role")
    for role in Role.objects.all():
        if "gift_void" in role.permissions:
            role.permissions = [p for p in role.permissions if p != "gift_void"]
            role.save(update_fields=["permissions"])


class Migration(migrations.Migration):

    dependencies = [
        ("events", "0005_delete_eventmembership"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]
