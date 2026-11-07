# Wedding Desk — wedding e-invitations and an offline gift desk

Record guests' money gifts at the wedding even without internet. Gifts are saved
instantly in the browser (IndexedDB) and uploaded to the Django API when the
backend is reachable — with no duplicates and nothing ever silently dropped.

- `backend/` — Django 5 + Django REST Framework + SimpleJWT (SQLite in dev)
- `frontend/` — Vue 3 + TypeScript + Vite + Pinia, `idb`, Fuse.js, html5-qrcode, tesseract.js, vite-plugin-pwa

## Run it

```bash
# Backend
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # macOS/Linux: .venv/bin/pip
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py seed_demo            # user demo / demo12345 + demo event & guests
.venv/Scripts/python manage.py runserver

# Frontend (another terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173 (no service worker in dev)
npm run build && npm run preview   # http://localhost:4173 — use this to test offline reloads
```

Configure with `frontend/.env` (see `.env.example`): `VITE_API_URL`, `VITE_OCR_LANGS` (e.g. `eng+khm`).
Backend env: `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`.

> Phones: camera scanning and the service worker require **HTTPS** (or `localhost`).
> Serve the built frontend over HTTPS for use on mobile devices.

## Deploy

Production runs on one DigitalOcean droplet with Docker Compose (PostgreSQL + Django + Caddy with automatic
HTTPS). Step-by-step guide: [docs/deploy.md](docs/deploy.md).

## Tests

```bash
cd backend && .venv/Scripts/python manage.py test      # 31 tests
cd frontend && npm test                                # 40 tests (Vitest + fake-indexeddb + msw)
```

## How offline gift recording works

1. **Guest cache** — opening the gift desk downloads the event's guests into the IndexedDB
   `guests` store (full list first, then deltas via `?updated_since=`, including tombstones
   for removed guests). If the server is unreachable the saved list is used.
2. **Find a guest** — fuzzy search (accent/typo tolerant, nickname, phone digits), QR/barcode
   scan of the guest's invitation code (print them from *Manage → QR sheet*), or photograph
   the name on a card (OCR) and tap the recognised line. Unknown guests can be recorded as walk-ins.
3. **Record** — each gift becomes one record in the IndexedDB `transactions` store with a
   client-generated UUID `txnId`, event, guest, amount, timestamp and `status: pending`.
   The UI confirms as soon as IndexedDB commits; upload happens in the background.
4. **Sync** (`src/offline/syncEngine.ts`) — triggered at startup, on `online`, on window
   focus/visibility, after each save, every 30 s while anything is pending, and by *Sync now*.
   `navigator.onLine` is only a hint; the upload attempt decides.

| State     | Meaning |
|-----------|---------|
| `pending` | Saved locally, waiting for upload (may be backing off after a temporary failure) |
| `syncing` | Claimed by the uploader (records left here by a crash are recovered on next run) |
| `synced`  | Server confirmed (`created` or `duplicate`) |
| `failed`  | Server rejected it permanently (validation, unknown guest, no access…) — fix & retry in the Sync center |

Safety rules:
- Records are claimed atomically in one IndexedDB transaction, and a Web Lock ensures one
  uploading tab; the server is idempotent on `client_txn_id`, so re-sending is always safe.
- Network errors, timeouts, 408/425/429 and 5xx → back to `pending` with exponential backoff (5 s → 5 min).
- 401 → one token refresh; if the refresh token is rejected, uploading pauses (`auth-required`)
  and records stay pending until the user logs in again. Logout never clears local gifts.
- A whole-batch 400/413 is split in halves to isolate the offending record.
- A record missing from the server response stays pending. Records are never deleted
  unless synced *and* the user explicitly clears old synced records.
- Only the manager who recorded a gift uploads it (attribution is preserved on shared devices).

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/token/`, `/api/auth/token/refresh/` | JWT |
| GET | `/api/auth/me/`, `/api/health/` | health is unauthenticated |
| CRUD | `/api/events/` | creator becomes owner |
| GET/POST, DELETE | `/api/events/{id}/members/`, `/members/{user_id}/` | owners manage managers |
| GET | `/api/events/{id}/report/` | totals by method/side/guest |
| CRUD | `/api/events/{id}/guests/` | `?updated_since=` delta; DELETE is a soft delete |
| POST | `/api/events/{id}/guests/import/` | multipart CSV (`full_name,nickname,phone,side,group,table_no`) |
| GET, PATCH | `/api/events/{id}/gifts/`, `/gifts/{gid}/` | PATCH requires `updated_at` (409 if stale) |
| POST | `/api/events/{id}/gifts/{gid}/void/` | requires `updated_at` |
| POST | `/api/gifts/sync/` | `{transactions:[…≤100]}` → per-item `created` / `duplicate` / `rejected` |

User accounts are created by an administrator in Django admin (`/admin/`).
