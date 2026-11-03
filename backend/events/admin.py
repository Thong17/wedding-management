from django.contrib import admin

from .models import Event, EventAssignment, Guest, Role


class AssignmentInline(admin.TabularInline):
    model = EventAssignment
    extra = 0
    raw_id_fields = ["user", "assigned_by"]


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ["name", "date", "client", "venue", "currency"]
    list_filter = ["client"]
    search_fields = ["name", "venue"]
    inlines = [AssignmentInline]


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ["name", "client", "updated_by", "updated_at"]
    list_filter = ["client"]


@admin.register(Guest)
class GuestAdmin(admin.ModelAdmin):
    list_display = ["full_name", "event", "side", "group", "phone", "is_deleted"]
    list_filter = ["event", "side", "is_deleted"]
    search_fields = ["full_name", "nickname", "phone"]
    readonly_fields = ["qr_token"]
