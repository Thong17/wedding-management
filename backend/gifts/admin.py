from django.contrib import admin

from .models import Gift


@admin.register(Gift)
class GiftAdmin(admin.ModelAdmin):
    list_display = ["client_created_at", "event", "guest", "walk_in_name", "amount", "currency", "method", "recorded_by", "voided"]
    list_filter = ["event", "method", "voided"]
    search_fields = ["client_txn_id", "guest__full_name", "walk_in_name"]
    readonly_fields = ["client_txn_id", "client_created_at", "received_at", "updated_at", "device_id", "recorded_by"]
