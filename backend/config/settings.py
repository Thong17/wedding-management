"""Django settings for the Wedding Management System API."""

import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DEV_SECRET_KEY = "dev-insecure-key-change-me-in-production-0123456789"
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", DEV_SECRET_KEY)
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,*").split(",")

if not DEBUG and SECRET_KEY == DEV_SECRET_KEY:
    from django.core.exceptions import ImproperlyConfigured

    raise ImproperlyConfigured("Set DJANGO_SECRET_KEY: the built-in development key must never be used in production.")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "accounts",
    "events",
    "gifts",
    "invites",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

if os.environ.get("POSTGRES_DB"):
    # Production (docker-compose.prod.yml): PostgreSQL.
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ["POSTGRES_DB"],
            "USER": os.environ.get("POSTGRES_USER", "postgres"),
            "PASSWORD": os.environ.get("POSTGRES_PASSWORD", ""),
            "HOST": os.environ.get("POSTGRES_HOST", "db"),
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
            "CONN_MAX_AGE": 60,
        }
    }
else:
    # Development: SQLite.
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": Path(os.environ.get("DJANGO_DB_PATH", BASE_DIR / "db.sqlite3")),
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
# `collectstatic` target (Django admin's CSS/JS); the web server serves it in production.
STATIC_ROOT = Path(os.environ.get("DJANGO_STATIC_ROOT", BASE_DIR / "staticfiles"))

# User uploads (profile pictures). Served by Django only while DEBUG is on;
# in production the web server must serve MEDIA_ROOT at MEDIA_URL.
MEDIA_URL = "media/"
MEDIA_ROOT = Path(os.environ.get("DJANGO_MEDIA_ROOT", BASE_DIR / "media"))
# Sensitive uploads (client documents). Never served at a URL; only via authenticated download views.
PRIVATE_MEDIA_ROOT = Path(os.environ.get("DJANGO_PRIVATE_MEDIA_ROOT", BASE_DIR / "private_media"))

# Where uploads live: "files" (local disk, the default) or "s3" (MinIO or any S3-compatible service).
# "default" holds public uploads (profile pictures), "private" holds client documents.
STORAGE_BACKEND = os.environ.get("STORAGE_BACKEND", "files")
if STORAGE_BACKEND == "s3":
    S3_BUCKET = os.environ["S3_BUCKET"]
    _s3 = {
        "bucket_name": S3_BUCKET,
        "endpoint_url": os.environ["S3_ENDPOINT_URL"],  # e.g. http://minio:9000
        "access_key": os.environ["S3_ACCESS_KEY"],
        "secret_key": os.environ["S3_SECRET_KEY"],
        "region_name": os.environ.get("S3_REGION", "us-east-1"),
        "addressing_style": "path",  # MinIO serves buckets as /bucket/key
        "file_overwrite": False,
    }
    STORAGES = {
        # Public: keys under avatars/ are anonymously readable and served at MEDIA_URL by Caddy.
        "default": {"BACKEND": "accounts.storage.PublicMediaStorage", "OPTIONS": _s3},
        # Private: under private/, never anonymously readable; only Django reads it.
        "private": {"BACKEND": "storages.backends.s3.S3Storage", "OPTIONS": {**_s3, "location": "private"}},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
else:
    STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "private": {"BACKEND": "django.core.files.storage.FileSystemStorage", "OPTIONS": {"location": PRIVATE_MEDIA_ROOT, "base_url": None}},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }

# New clients and standalone customers start with a trial of this many days.
DEFAULT_TRIAL_DAYS = 14
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    # Every endpoint refuses locked logins unless it opts out (gift upload) or allows reads (GET /me).
    # Views that set their own permission_classes must keep both of these.
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
        "events.access.NotLocked",
    ],
    "DEFAULT_PAGINATION_CLASS": None,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    # Long refresh lifetime: a manager may be offline for a whole wedding day.
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": False,
}

CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
).split(",")

# Admin login forms need the site's own HTTPS origin, e.g. "https://giftdesk.duckdns.org".
CSRF_TRUSTED_ORIGINS = [o for o in os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",") if o]

if not DEBUG:
    # Behind Caddy, which terminates HTTPS and says so in X-Forwarded-Proto. Without this, links
    # Django builds (profile picture URLs) would say http:// and browsers would block them.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    # Caddy (deploy/Caddyfile) redirects http → https and sends Strict-Transport-Security itself.
    SILENCED_SYSTEM_CHECKS = ["security.W004", "security.W008"]

# Gift sync limits
GIFT_SYNC_MAX_BATCH = 100
