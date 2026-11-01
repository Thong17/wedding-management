from django.contrib import admin

from .models import Event, EventMembership, Guest


class MembershipInline(admin.TabularInline):
    model = EventMembership
    extra = 0


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ["name", "date", "venue", "currency"]
    search_fields = ["name", "venue"]
    inlines = [MembershipInline]


@admin.register(Guest)
class GuestAdmin(admin.ModelAdmin):
    list_display = ["full_name", "event", "side", "group", "phone", "is_deleted"]
    list_filter = ["event", "side", "is_deleted"]
    search_fields = ["full_name", "nickname", "phone"]
    readonly_fields = ["qr_token"]
