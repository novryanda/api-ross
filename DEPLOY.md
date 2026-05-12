# 🚀 ROSS/BuzzTrack Backend – Deployment Guide

## Architecture

```
┌──────────────────┐         ┌──────────────────┐
│  Vercel           │ HTTPS   │  VPS / Dokploy   │
│  (Next.js Frontend)│───────▶│  ross-api:3001   │
│                    │         │  (Docker)        │
└──────────────────┘         └────────┬─────────┘
                                       │
                              ┌────────▼─────────┐
                              │  PostgreSQL       │
                              │  (existing in     │
                              │   Dokploy)        │
                              └──────────────────┘
```

- **Frontend**: Next.js on Vercel
- **Backend**: NestJS in Docker on VPS
- **Database**: Existing PostgreSQL (Dokploy container or managed service)

---

## Prerequisites

- Docker & Docker Compose installed on VPS
- PostgreSQL accessible from VPS (Dokploy internal network or external)
- Domain/subdomain for the API (e.g., `api.yourdomain.com`)
- Reverse proxy (Nginx/Caddy/Traefik) for HTTPS termination

---

## Quick Deploy

### 1. Clone & Configure

```bash
# SSH into your VPS
ssh user@your-vps

# Clone the repository (or upload)
git clone <your-repo-url>
cd ross-project/api

# Create production .env from template
cp .env.example .env
nano .env
```

### 2. Configure Environment Variables

Edit `.env` with production values:

```env
# Database – point to existing PostgreSQL
DATABASE_URL="postgresql://ross_user:secure_password@db-host:5432/ross_db?schema=public"

# Better Auth – generate a secure secret
BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
BETTER_AUTH_URL="https://api.yourdomain.com"

# Trusted Origins – your Vercel frontend URL + backend URL
TRUSTED_ORIGINS="https://yourdomain.com,https://api.yourdomain.com"

# Port
PORT=3001
NODE_ENV=production
```

> **⚠️ Important**: `BETTER_AUTH_URL` must be the public URL of your backend.
> `TRUSTED_ORIGINS` must include your Vercel frontend URL for CORS + cookies.

### 3. Build & Start

```bash
# Build and start in detached mode
docker compose up -d --build

# Check logs
docker compose logs -f ross-api

# Verify health
curl http://localhost:3001/health
```

Expected health response:
```json
{
  "status": "ok",
  "service": "ross-api",
  "version": "0.0.1",
  "timestamp": "2026-05-12T04:00:00.000Z",
  "uptime": 42
}
```

### 4. Seed Initial Admin (first deploy only)

```bash
docker compose exec ross-api npx tsx prisma/seed.ts
```

---

## Dokploy-Specific Deployment

If deploying via Dokploy's UI:

1. **Source**: Connect to your Git repository
2. **Build**: Select `Dockerfile` (auto-detected from repo root `api/`)
3. **Environment**: Add all `.env` variables in Dokploy's environment section
4. **Port**: Map port `3001` (or your `PORT` value)
5. **Domain**: Assign your API subdomain
6. **Health Check**: Set path to `/health`

### Database Networking (Dokploy)

If your PostgreSQL runs in Dokploy on the same server:

```env
# Use Dokploy's internal Docker network hostname
DATABASE_URL="postgresql://ross_user:password@dokploy-postgres:5432/ross_db?schema=public"
```

Add the API container to the same Docker network as the database:

```yaml
# In docker-compose.yml, add:
services:
  ross-api:
    networks:
      - dokploy-network  # Match your Dokploy network name

networks:
  dokploy-network:
    external: true
```

---

## CORS & Cookie Configuration

### How It Works

| Setting | Value | Notes |
|---------|-------|-------|
| CORS Origin | `TRUSTED_ORIGINS` env | Comma-separated list |
| Credentials | `true` | Required for cookies |
| Secure Cookies | Auto (`NODE_ENV=production`) | HTTPS only in prod |
| Cookie Prefix | `ross` | e.g., `ross.session_token` |
| SameSite | `lax` (Better Auth default) | Works cross-subdomain |

### Frontend Vercel Configuration

Your Next.js frontend must proxy API requests or configure `withCredentials`:

```typescript
// Next.js API fetch example
const res = await fetch('https://api.yourdomain.com/api/v1/auth/me', {
  credentials: 'include',  // Send cookies cross-origin
});
```

### Same-Domain vs Cross-Domain

| Setup | Cookie Behavior |
|-------|----------------|
| `app.example.com` → `api.example.com` | ✅ Works with `SameSite=lax` |
| `example.com` → `api.example.com` | ✅ Works with `SameSite=lax` |
| `example.vercel.app` → `api.otherdomain.com` | ⚠️ Needs `SameSite=none` + `Secure` |

> **Recommendation**: Use a subdomain of the same domain for backend
> (e.g., `api.yourdomain.com`) to avoid third-party cookie issues.

---

## Prisma Migration Flow

### Automatic (via Entrypoint)

The `docker-entrypoint.sh` script runs `prisma migrate deploy` on every container start.
This only applies **pending** migrations — it never creates new ones.

### Manual Migration Workflow

```bash
# Development: Create a new migration
npx prisma migrate dev --name add_new_field

# Production: Apply pending migrations (done automatically by entrypoint)
docker compose exec ross-api npx prisma migrate deploy

# Emergency: Reset database (DESTRUCTIVE!)
docker compose exec ross-api npx prisma migrate reset --force
```

---

## Reverse Proxy (Nginx Example)

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/ssl/certs/yourdomain.pem;
    ssl_certificate_key /etc/ssl/private/yourdomain.key;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Required for Better Auth cookies
        proxy_set_header Cookie $http_cookie;
        proxy_pass_header Set-Cookie;
    }
}
```

---

## Operations

### View Logs
```bash
docker compose logs -f ross-api
docker compose logs --tail=100 ross-api
```

### Restart
```bash
docker compose restart ross-api
```

### Rebuild & Redeploy
```bash
docker compose down
docker compose up -d --build
```

### Enter Container Shell
```bash
docker compose exec ross-api sh
```

### Check Database Connection
```bash
docker compose exec ross-api npx prisma db execute --stdin <<< "SELECT 1;"
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | – | PostgreSQL connection string |
| `PORT` | ❌ | `3001` | API listen port |
| `NODE_ENV` | ❌ | `production` | Set in Dockerfile |
| `BETTER_AUTH_SECRET` | ✅ | – | 32+ char random secret |
| `BETTER_AUTH_URL` | ✅ | – | Public backend URL |
| `TRUSTED_ORIGINS` | ✅ | – | Allowed CORS origins |
| `EXPORT_PROCESSING_TIMEOUT_MINUTES` | ❌ | `10` | Processing timeout |
| `R2_ACCOUNT_ID` | ✅ | – | Cloudflare Account ID |
| `R2_ENDPOINT` | ✅ | – | R2 S3-compatible endpoint |
| `R2_BUCKET` | ✅ | – | R2 bucket name |
| `R2_ACCESS_KEY_ID` | ✅ | – | R2 access key |
| `R2_SECRET_ACCESS_KEY` | ✅ | – | R2 secret key |
| `R2_PUBLIC_BASE_URL` | ❌ | – | Public R2 URL (CDN) |
| `R2_FORCE_PATH_STYLE` | ❌ | `true` | S3 path-style access |
| `SEED_*` | ❌ | – | Initial admin seed values |

---

## Troubleshooting

### Container Won't Start
```bash
# Check logs for migration errors
docker compose logs ross-api | head -50

# Common fix: database not reachable
# Verify DATABASE_URL and network connectivity
docker compose exec ross-api sh -c 'wget -qO- $DATABASE_URL' 2>&1 | head -5
```

### Cookie Not Working Cross-Origin
1. Ensure `TRUSTED_ORIGINS` includes your frontend URL
2. Ensure `BETTER_AUTH_URL` matches the public backend URL
3. Check reverse proxy forwards `Cookie` and `Set-Cookie` headers
4. Use same root domain for frontend and backend

### Prisma Migration Fails
```bash
# Check migration status
docker compose exec ross-api npx prisma migrate status

# If stuck, check which migrations are pending
docker compose exec ross-api npx prisma migrate resolve --applied <migration_name>
```
