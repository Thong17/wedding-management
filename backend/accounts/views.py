from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    """Cheap reachability probe; `navigator.onLine` alone does not prove the API is up."""
    return Response({"status": "ok", "time": timezone.now().isoformat()})


@api_view(["GET"])
def me(request):
    user = request.user
    return Response(
        {
            "id": user.id,
            "username": user.username,
            "first_name": user.first_name,
            "last_name": user.last_name,
        }
    )
