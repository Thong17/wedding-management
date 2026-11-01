import datetime

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from events.models import Event, EventMembership, Guest

GUESTS = [
    ("Sokha Chan", "Sokha", "012345678", "bride", "Family"),
    ("Dara Kim", "", "098765432", "groom", "Friends"),
    ("Srey Mom", "Mom", "011223344", "bride", "Family"),
    ("Vuthy Lim", "", "077889900", "groom", "Work"),
    ("Bopha Seng", "Pha", "015556677", "both", "Neighbours"),
    ("John Smith", "Johnny", "", "groom", "Friends"),
    ("Maria García", "", "", "bride", "Friends"),
    ("Nguyễn Văn An", "An", "", "both", "Work"),
]


class Command(BaseCommand):
    help = "Create a demo manager account (demo / demo12345) with one event and sample guests."

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        user, created = User.objects.get_or_create(username="demo", defaults={"first_name": "Demo"})
        if created:
            user.set_password("demo12345")
            user.is_staff = True
            user.is_superuser = True
            user.save()
        event, _ = Event.objects.get_or_create(
            name="Demo Wedding",
            defaults={
                "date": datetime.date.today(),
                "venue": "Grand Hall",
                "currency": "USD",
                "created_by": user,
            },
        )
        EventMembership.objects.get_or_create(event=event, user=user, defaults={"role": "owner"})
        for full_name, nickname, phone, side, group in GUESTS:
            Guest.objects.get_or_create(
                event=event,
                full_name=full_name,
                defaults={"nickname": nickname, "phone": phone, "side": side, "group": group},
            )
        self.stdout.write(self.style.SUCCESS(f"Seeded event #{event.pk}. Login: demo / demo12345"))
