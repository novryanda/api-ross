# ROSS/BuzzTrack Backend – Deployment Guide

## Architecture

```
Internet → Dokploy Reverse Proxy → Docker Network → ross-api:3001
```

- **Backend** listens on internal port `3001` (configurable via `PORT` env var)
- **Dokploy** manages SSL, domain routing, and reverse proxy (Traefik/Nginx)
- **Database** is an existing PostgreSQL instance — no DB service in compose

---

## Docker Compose: `expose` vs `ports`

### ✅ Correct (for Dokploy)

```yaml
expose:
  - '${PORT:-3001}'
```

`expose` makes the port visible **within the Docker network only**. Dokploy's
reverse proxy connects to the container via the shared `dokploy-network` and
routes external traffic (domain) to the container's exposed port.

### ❌ Wrong (causes deployment failure)

```yaml
ports:
  - '3001:3001'
```

`ports` binds the container port to the **host machine's port 3001**. This
causes `Bind for 0.0.0.0:3001 failed: port is already allocated` when:

- A previous container hasn't fully released the port
- Another service on the VPS already uses port 3001
- Dokploy redeploys and the old container is still running

### Why no `container_name`?

Fixed `container_name` values (e.g. `container_name: ross-api`) cause conflicts
during Dokploy blue-green deploys because Docker cannot create two containers
with the same name. Letting Dokploy generate names avoids this.

---

## Environment Variables

All env vars are injected via Dokploy's environment settings. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (Dokploy-managed DB) |
| `PORT` | ❌ | Internal listen port (default: `3001`) |
| `BETTER_AUTH_SECRET` | ✅ | Auth signing secret |
| `BETTER_AUTH_URL` | ✅ | Public API URL (e.g. `https://api.yourdomain.com`) |
| `EXPORT_STORAGE_DRIVER` | ❌ | `local` or `r2` (default: `local`) |
| `R2_ENDPOINT` | When R2 | Cloudflare R2 endpoint |
| `R2_BUCKET` | When R2 | R2 bucket name |
| `R2_ACCESS_KEY_ID` | When R2 | R2 access key |
| `R2_SECRET_ACCESS_KEY` | When R2 | R2 secret key |

---

## Dokploy Setup

1. **Source**: Connect GitHub repo `novryanda/api-ross` (branch: `main`)
2. **Build**: Docker Compose (`docker-compose.yml`)
3. **Domain**: Add domain in Dokploy → routes to service port `3001`
4. **Network**: Container joins `dokploy-network` (external, pre-existing)
5. **Environment**: Set all required env vars in Dokploy dashboard

### Domain Routing

In Dokploy domain settings, set the **container port** to `3001`. Dokploy's
reverse proxy will handle:

- SSL termination (Let's Encrypt)
- HTTP → HTTPS redirect
- Domain → container:3001 routing

---

## Startup Sequence

The `docker-entrypoint.sh` script runs on container start:

1. `prisma migrate deploy` — applies pending migrations
2. `tsx prisma/bootstrap-admin.ts` — creates initial admin (idempotent)
3. `node dist/main.js` — starts the NestJS server

---

## Troubleshooting

### `Bind for 0.0.0.0:3001 failed: port is already allocated`

**Cause**: `ports` directive binding host port. **Fix**: Use `expose` instead.

### Container starts but API unreachable via domain

1. Verify container is on `dokploy-network`: `docker inspect <container> | grep dokploy`
2. Verify Dokploy domain points to correct service port (`3001`)
3. Check healthcheck: `docker inspect --format='{{.State.Health.Status}}' <container>`

### Database connection refused

`DATABASE_URL` must point to a host reachable from within Docker. If the DB is
a Dokploy-managed service, use its internal Docker hostname (not `localhost`).
