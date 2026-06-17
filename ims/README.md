# Inventory Management System (IMS)

A small, fully working Inventory Management System built as a monorepo and
designed to be containerized and orchestrated on **Kubernetes (EKS)** with an
**external PostgreSQL database (AWS RDS)**.

The emphasis is on correctness, clean separation of services, and cloud-native /
12-factor compliance — not on flashy product features.

## Architecture

```
                  ┌─────────────────────────────────────────┐
                  │           Kubernetes Ingress             │
                  │   /  → frontend     /api → backend       │
                  └───────────────┬──────────────┬──────────┘
                                  │              │
                        ┌─────────▼───┐    ┌─────▼──────────┐
                        │  frontend   │    │   backend      │
                        │ nginx + SPA │    │ Node + Express │
                        │ (2 replicas)│    │  (2 replicas)  │
                        └─────────────┘    └───────┬────────┘
                                                   │ pg (SSL)
                                          ┌────────▼─────────┐
                                          │  PostgreSQL      │
                                          │  (external/RDS)  │
                                          └──────────────────┘
```

Two **independent, separately deployable** services that communicate only over
HTTP:

- **backend** — Node.js + Express REST API using the `pg` driver and raw SQL.
- **frontend** — React + Vite SPA, served as static files by nginx.

### Stateless / external-DB design

- Both services are **fully stateless**: no local files, no session state. All
  configuration comes from **environment variables** (12-factor).
- The database is **external**. Postgres is never run inside the app pods; there
  is no StatefulSet and no PVC. Connection details and credentials come only
  from a ConfigMap + Secret.
- Logs go to **stdout/stderr**.
- The backend handles **SIGTERM** for graceful shutdown — it stops accepting new
  connections, drains in-flight requests, then closes the DB pool — so K8s
  rolling updates don't drop requests.
- The frontend talks to the API via the **relative path `/api`** so the same
  build works in dev (Vite proxy) and prod (ingress routing).

## Local development

Requires Docker. From the `ims/` directory:

```bash
docker compose up --build
```

Then open **http://localhost:8080**.

This starts Postgres (with a healthcheck), the backend (waits for Postgres to be
healthy, runs an idempotent migration, seeds 8 sample items), and the frontend.
The backend is also exposed on `http://localhost:3000` for direct API testing.

> The frontend container in compose mounts `frontend/nginx.compose.conf`, a
> dev-only config that proxies `/api` → backend so a single `:8080` origin
> works without an ingress. The image's baked-in `nginx.conf` does **not** proxy
> `/api` (the K8s ingress does that in production).

### Running services directly (without Docker)

```bash
# backend
cd backend && cp .env.example .env   # edit as needed
npm install && npm start             # http://localhost:3000

# frontend (separate terminal)
cd frontend
npm install && npm run dev           # http://localhost:5173 (proxies /api → :3000)
```

## Build and push images

```bash
export REGISTRY=<your-registry>      # e.g. 123456789.dkr.ecr.us-east-1.amazonaws.com

docker build -t $REGISTRY/ims-backend:latest  ./backend
docker build -t $REGISTRY/ims-frontend:latest ./frontend

docker push $REGISTRY/ims-backend:latest
docker push $REGISTRY/ims-frontend:latest
```

## Deploy to Kubernetes

Plain YAML manifests live in `k8s/` (no Helm).

**Before applying, fill in:**

1. `k8s/configmap.yaml` — `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_SSL`
   (use `DB_SSL: "true"` for RDS).
2. `k8s/secret.yaml` — base64-encoded `DB_PASSWORD`
   (`echo -n 'your-password' | base64`).
3. The image placeholders `<REGISTRY>/ims-backend:latest` and
   `<REGISTRY>/ims-frontend:latest` in the two deployments.
4. `k8s/ingress.yaml` — the `host:` value (and the TLS/cert-manager block if
   using HTTPS).

**Apply (order matters — config before the workloads that consume it):**

```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/backend-service.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/frontend-service.yaml
kubectl apply -f k8s/ingress.yaml
```

Then browse to the ingress host. The backend sets an `X-Pod` header on `/api`
responses (the serving pod's name) so you can watch load-balancing across
replicas during a demo:

```bash
curl -i http://<ingress-host>/api/items | grep -i x-pod
```

## API reference

Base path: `/api`. Errors use the shape `{ "error": "..." }`.

| Method | Path             | Description                                            |
|--------|------------------|--------------------------------------------------------|
| GET    | `/api/items`     | List items. Query: `?search=` (name/sku/category, case-insensitive), `?category=`. |
| GET    | `/api/items/:id` | Get one item (404 if missing).                         |
| POST   | `/api/items`     | Create item. Returns 201 with the created item.        |
| PUT    | `/api/items/:id` | Update item (full or partial). 404 if missing.         |
| DELETE | `/api/items/:id` | Delete item. 204 on success, 404 if missing.           |

Health (used by K8s probes):

| Method | Path        | Description                                          |
|--------|-------------|------------------------------------------------------|
| GET    | `/healthz`  | Liveness. Returns 200 without touching the DB.       |
| GET    | `/readyz`   | Readiness. Runs `SELECT 1`; 200 if OK, else 503.     |

### Item shape

```json
{
  "id": 1,
  "name": "USB-C Cable 1m",
  "sku": "CBL-USBC-1M",
  "category": "Cables",
  "quantity": 120,
  "price": "6.99",
  "created_at": "2026-06-16T10:00:00.000Z",
  "updated_at": "2026-06-16T10:00:00.000Z"
}
```

### Sample curl commands

```bash
BASE=http://localhost:3000

# List
curl $BASE/api/items

# Search
curl "$BASE/api/items?search=cable"
curl "$BASE/api/items?category=Cables"

# Get one
curl $BASE/api/items/1

# Create
curl -X POST $BASE/api/items \
  -H 'Content-Type: application/json' \
  -d '{"name":"Power Bank","sku":"PWR-10000","category":"Accessories","quantity":15,"price":29.99}'

# Update (partial)
curl -X PUT $BASE/api/items/1 \
  -H 'Content-Type: application/json' \
  -d '{"quantity":99}'

# Delete
curl -X DELETE $BASE/api/items/1 -i
```

## Environment variable reference

### Backend

| Variable       | Default     | Description                                              |
|----------------|-------------|---------------------------------------------------------|
| `PORT`         | `3000`      | HTTP listen port.                                       |
| `DB_HOST`      | `localhost` | PostgreSQL host.                                        |
| `DB_PORT`      | `5432`      | PostgreSQL port.                                        |
| `DB_NAME`      | `ims`       | Database name.                                          |
| `DB_USER`      | `postgres`  | Database user.                                          |
| `DB_PASSWORD`  | `postgres`  | Database password (from a Secret in K8s).              |
| `DB_SSL`       | `false`     | `true` enables SSL with `rejectUnauthorized: false` (RDS). |
| `DB_POOL_MAX`  | `10`        | Max `pg` pool connections.                             |
| `ALLOW_ORIGIN` | _(unset)_   | If set, enables CORS for that origin (local dev).      |
| `HOSTNAME`     | _(by K8s)_  | Reported in the `X-Pod` response header on `/api`.     |

### Frontend (build/dev time)

| Variable          | Default                 | Description                                  |
|-------------------|-------------------------|----------------------------------------------|
| `VITE_API_TARGET` | `http://localhost:3000` | Dev-only: Vite proxy target for `/api`.     |

## Project structure

```
ims/
├── backend/            # Node + Express + pg REST API
│   ├── src/
│   │   ├── server.js   # bootstrap, listen, SIGTERM graceful shutdown
│   │   ├── app.js      # express app, health endpoints, CORS, X-Pod header
│   │   ├── items.js    # /api/items routes + validation
│   │   ├── db.js       # pg Pool from env vars
│   │   └── migrate.js  # idempotent CREATE TABLE + seed
│   └── Dockerfile      # node:20-alpine, non-root, tini
├── frontend/           # React + Vite SPA served by nginx
│   ├── src/
│   ├── nginx.conf      # production: SPA fallback, no /api proxy
│   ├── nginx.compose.conf  # local dev: proxies /api → backend
│   └── Dockerfile      # multi-stage: build → nginx:alpine
├── k8s/                # plain YAML manifests
├── docker-compose.yml
└── README.md
```
