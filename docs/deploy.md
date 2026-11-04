# Deploying to a DigitalOcean droplet

One Ubuntu droplet runs everything with Docker Compose:

| Container | Does |
|---|---|
| `web` (Caddy) | HTTPS (free Let's Encrypt certificate, renewed automatically), serves the app, forwards `/api` and `/admin` to Django, serves profile pictures |
| `backend` (Django + gunicorn) | The API. Runs database migrations every time it starts |
| `db` (PostgreSQL 16) | The database, on a Docker volume |

Client documents (ID cards, contracts) live in their own volume that only Django can read; Caddy never serves them.

Your address will be `https://<name>.duckdns.org`. HTTPS is what lets phones install the app, use it offline and use the camera scanners.

---

## 1. Before you start (on your computer)

1. Run the checks, so nothing broken gets deployed:
   ```powershell
   cd frontend; npm run build; npm test
   cd ..\backend; .venv\Scripts\python manage.py test
   ```
2. Merge your branch into `main` and push it to GitHub (`Thong17/wedding-management`).
3. If the GitHub repository is **private**, the droplet needs permission to download it. Easiest: create a
   [fine-grained personal access token](https://github.com/settings/personal-access-tokens) with read-only
   *Contents* access to this one repository, and use it as the password when `git clone` asks.
4. **Build and push the images** to Docker Hub with the Docker in WSL. The npm scripts run on Windows and hand
   the work to WSL ([deploy/docker-release.sh](../deploy/docker-release.sh)):
   ```powershell
   wsl docker login -u thonggee                                          # once
   wsl docker run --privileged --rm tonistiigi/binfmt --install amd64    # once per WSL restart (see below)
   npm run dockerRelease        # = npm run dockerBuild, then npm run dockerPush
   ```
   This builds `thonggee/wedding-api:latest` and `thonggee/wedding-web:latest` **for `linux/amd64`**, which is what
   droplets run. This computer (and its WSL) is ARM, so the second line turns on x86 emulation; the setting is lost
   when WSL restarts, and the build script tells you when it's needed again. Emulated builds are slower, so expect
   several minutes. The droplet then only downloads the images, which is faster and avoids running out of memory.
   Docker Hub repositories are public by default: the images contain the app's code but no secrets (those live
   only in the server's `.env`). To make them private, change them on hub.docker.com and run `docker login` on
   the droplet too.

## 2. Create the droplet

In the DigitalOcean dashboard → **Create → Droplets**:

- **Region:** Singapore (closest to Cambodia).
- **Image:** Ubuntu 24.04 LTS.
- **Size:** Basic, Regular. **2 GB / $12** is comfortable. **1 GB / $6** works too with the swap file in step 4.
- **Authentication:** SSH key (recommended).
- Optionally tick **Backups** (DigitalOcean snapshots the whole droplet weekly, ~20% of the droplet price).

Note the droplet's **IPv4 address**.

**Networking → Firewalls → Create**: allow inbound **SSH (22)**, **HTTP (80)**, **HTTPS (443)**; apply it to the droplet.
(Port 80 must be open: Let's Encrypt uses it to issue the certificate, and Caddy redirects it to HTTPS.)

## 3. Point DuckDNS at the droplet

On [duckdns.org](https://www.duckdns.org), set your domain's **current ip** to the droplet's IPv4 address and press **update ip**.
The droplet's address doesn't change, so you only do this once.

Check it from your computer (should print the droplet's IP):
```powershell
nslookup yourname.duckdns.org
```

## 4. Prepare the server

```bash
ssh root@<droplet-ip>

# 1 GB droplets only: add 2 GB of swap so building the app doesn't run out of memory.
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Docker (official install script) and git.
curl -fsSL https://get.docker.com | sh
apt-get install -y git
```

## 5. Get the code and configure it

```bash
cd /opt
git clone https://github.com/Thong17/wedding-management.git
cd wedding-management
cp .env.prod.example .env

# Generate two secrets and copy them into .env:
python3 -c "import secrets; print('DJANGO_SECRET_KEY=' + secrets.token_urlsafe(50))"
python3 -c "import secrets; print('POSTGRES_PASSWORD=' + secrets.token_urlsafe(24))"
nano .env
```

In `.env`, replace every `yourname.duckdns.org` with your address and paste the two secrets.
Keep `.env` private: it holds the keys to your data, and it's ignored by git.

## 6. Start it

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

(`up -d --build` instead builds the images on the droplet from the code, if you haven't pushed them.) Then:

```bash
docker compose -f docker-compose.prod.yml ps                  # all three should be "running"/"healthy"
docker compose -f docker-compose.prod.yml logs -f web         # watch Caddy get the certificate (Ctrl+C to stop)
```

Open `https://yourname.duckdns.org`. You should see the login page with a padlock.

## 7. Create your platform admin login

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```

Sign in with it. As platform admin you create clients and their logins from **Clients** and **Users** in the sidebar.
The Django admin is at `https://yourname.duckdns.org/admin/` if you ever need it.

## 8. Backups

`deploy/backup.sh` saves the database and all uploads into `backups/` and keeps 14 days. Run it every night at 3 am:

```bash
crontab -e
# add this line:
0 3 * * * cd /opt/wedding-management && sh deploy/backup.sh >> backups/cron.log 2>&1
```

Backups on the same droplet don't survive losing the droplet, so copy them off now and then
(or enable DigitalOcean droplet backups). From your computer:

```powershell
scp -r root@<droplet-ip>:/opt/wedding-management/backups .\server-backups
```

**Restoring** (overwrites current data):

```bash
cd /opt/wedding-management
gunzip -c backups/db-YYYYMMDD-HHMMSS.sql.gz | docker compose -f docker-compose.prod.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker run --rm -v wedding-management_media:/media -v wedding-management_private_media:/private_media \
  -v "$PWD/backups:/backups" alpine tar xzf /backups/files-YYYYMMDD-HHMMSS.tar.gz -C /
```

## 9. Updating to a new version

On your computer, push the code to `main` and the new images to Docker Hub:

```powershell
git push origin main
npm run dockerRelease
```

Then on the droplet:

```bash
cd /opt/wedding-management && sh deploy/update.sh
```

It backs up first, pulls the latest config and images, and restarts; database migrations run automatically.
Phones pick up the new version the next time the app is opened online.

## Troubleshooting

| Problem | Check |
|---|---|
| No padlock / certificate error | `logs web`. DuckDNS must point at this droplet, and ports 80 and 443 must be open in the firewall. Let's Encrypt limits retries, so fix DNS first, then `docker compose -f docker-compose.prod.yml restart web`. |
| "502 Bad Gateway" | `docker compose -f docker-compose.prod.yml logs backend`. Usually a mistake in `.env`. |
| Build stops with "killed" | Out of memory: add the swap file from step 4, or use a 2 GB droplet (or push images from your computer instead of building on the droplet). |
| `exec format error` when a container starts | The image was built for ARM. Rebuild with `npm run dockerRelease`, which builds for `linux/amd64`. |
| Login works but nothing loads | `DJANGO_ALLOWED_HOSTS` must be exactly your address, without `https://`. |
| Django admin says "CSRF verification failed" | `CSRF_TRUSTED_ORIGINS` must be your address **with** `https://`. |

Your local development database isn't copied to the server: production starts empty, with only the built-in Default role.

---

## Sharing a droplet with an existing Caddy

If another app's Caddy container already owns ports 80/443 (for example the SereyHub droplet), keep it as the
single front door. It handles HTTPS for both apps and forwards your DuckDNS address to this app over a private
Docker network. This app's own Caddy then serves plain HTTP inside Docker only.

**Memory first.** Each app needs its share of RAM. On a 1 GB droplet with no swap, add the 2 GB swap file from
step 4 before anything else, or the kernel may stop containers (either app's) when memory runs out.

1. **Shared network**, and connect the existing Caddy to it:
   ```bash
   docker network create wedding-proxy
   docker network connect wedding-proxy caddy
   ```
   If that Caddy is started from its own compose file, also add the network there so it survives re-creating
   the container:
   ```yaml
   services:
     caddy:
       networks: [default, wedding-proxy]
   networks:
     wedding-proxy:
       external: true
   ```

2. **This app**: follow steps 5–6, and add these to `.env`:
   ```
   COMPOSE_FILE=docker-compose.prod.yml:docker-compose.shared-proxy.yml
   GUNICORN_WORKERS=2
   ```
   With `COMPOSE_FILE` set, plain `docker compose …` uses both files (no `-f` needed):
   ```bash
   docker compose pull && docker compose up -d
   ```
   Nothing is published on the droplet's ports; `ports: !reset []` needs Docker Compose 2.24 or newer
   (`docker compose version`).

3. **Existing Caddy**: add a site block to its Caddyfile (find it with `docker inspect caddy --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'`):
   ```
   yourname.duckdns.org {
   	reverse_proxy wedding-web:80
   }
   ```
   Then reload it without downtime for SereyHub:
   ```bash
   docker exec caddy caddy reload --config /etc/caddy/Caddyfile
   ```
   It gets the certificate for the DuckDNS address itself, like it does for SereyHub's domain.

4. Create your login (step 7) with `docker compose exec backend python manage.py createsuperuser`, and set up
   backups (step 8). `deploy/backup.sh` and `deploy/update.sh` pick up `COMPOSE_FILE` from `.env` automatically.

---

## Storing uploads in MinIO

By default uploads (profile pictures, client documents) live in Docker volumes on the droplet. To keep them in
a MinIO (or any S3-compatible) bucket instead, for example the MinIO already running on the SereyHub droplet:

- One bucket (e.g. `wedding`). Profile pictures go under `avatars/`, which is the only publicly readable part;
  they're served on your own domain at `/media/avatars/…` (Caddy forwards to MinIO, browsers never talk to it).
- Client documents go under `private/`, which is never public; only Django reads them, for signed-in admins.
- When the backend starts it creates the bucket if needed and sets the public-read rule for `avatars/` only.

**1. An access key just for this app.** In the MinIO console (port 9001): *Identity → Users → Create User*
(e.g. `wedding-app`) with this policy, which allows everything on the `wedding` bucket and nothing else
(*Policies → Create Policy*, then attach it to the user):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:*"],
    "Resource": ["arn:aws:s3:::wedding", "arn:aws:s3:::wedding/*"]
  }]
}
```

Then create an **access key** for that user (*Access Keys → Create*) and copy both parts.

**2. Let this app reach MinIO** on the shared network:

```bash
docker network connect wedding-proxy minio
```

(As with Caddy, add `wedding-proxy` to MinIO's own compose file too, so it survives re-creating the container.)

**3. `.env`:**

```
STORAGE_BACKEND=s3
S3_ENDPOINT_URL=http://minio:9000
S3_UPSTREAM=minio:9000
S3_BUCKET=wedding
S3_ACCESS_KEY=<access key>
S3_SECRET_KEY=<secret key>
S3_NETWORK=wedding-proxy
```

**4. Restart:** `docker compose up -d`. The backend log should say `Storage ready: bucket wedding, public read on
avatars/ only.` (`docker compose logs backend | grep -i storage`). If MinIO is unreachable the app still starts and
logs the problem; uploads work again once it's reachable.

Backups (`deploy/backup.sh`) copy the bucket into `backups/files-….tar.gz` along with the database.

> **MinIO images:** `minio/minio` can no longer be downloaded from Docker Hub. An existing MinIO container keeps
> working, but don't delete its image (avoid `docker image prune -a`). If you ever need to re-create it,
> `cgr.dev/chainguard/minio` is a maintained build of the same server.
