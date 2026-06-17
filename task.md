# Claude Code prompt — Inventory Management System (Kubernetes-ready)

Paste everything below the line into Claude Code from an empty project directory.

---

Build a small but fully working **Inventory Management System (IMS)** as a monorepo, designed to be containerized and orchestrated on **Kubernetes (EKS)** with an **external PostgreSQL database (AWS RDS)**. The product itself is secondary — what matters most is correctness, clean separation of the two services, and cloud-native / 12-factor compliance. Aim for "respectable and genuinely working," not flashy or over-engineered.

## Repo structure
```
ims/
├── backend/
├── frontend/
├── k8s/
├── docker-compose.yml
└── README.md
```

## Hard constraints (these are non-negotiable — it must orchestrate cleanly in Kubernetes)
- Two **independent, separately deployable** services: `backend` (REST API) and `frontend` (web UI). They communicate only over HTTP.
- Every service is **fully stateless**: no local file or session state, all configuration via **environment variables** (12-factor).
- The database is **external** PostgreSQL. Do NOT run Postgres inside the app, do NOT use a StatefulSet or PVC, do NOT hardcode credentials. Connection details come only from env vars.
- Logs go to stdout/stderr. Handle **SIGTERM** for graceful shutdown (stop accepting connections, drain, close the DB pool) so Kubernetes rolling updates don't drop requests.
- Scope limits — do NOT add: authentication, user accounts, payments, message queues, caching layers, or any service beyond these two tiers. Keep dependencies minimal.

## Backend — Node.js + Express + `pg`
- REST API under `/api` for inventory items. Item fields: `id` (serial PK), `name` (text, required), `sku` (text, unique, required), `category` (text), `quantity` (integer, >= 0), `price` (numeric(10,2), >= 0), `created_at`, `updated_at`.
- Endpoints:
  - `GET /api/items` — list all; support `?search=` (matches name/sku/category, case-insensitive) and `?category=`.
  - `GET /api/items/:id`
  - `POST /api/items` — validate input, return 201 with the created item.
  - `PUT /api/items/:id` — update; 404 if missing.
  - `DELETE /api/items/:id` — 204; 404 if missing.
- Validation with clear 400 messages, correct status codes, JSON error shape `{ "error": "..." }`.
- DB connection from env: `DB_HOST`, `DB_PORT` (default 5432), `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL` ("true"/"false"). Use a `pg` Pool. When `DB_SSL=true`, use `ssl: { rejectUnauthorized: false }` (needed for RDS).
- On startup, run an **idempotent migration**: `CREATE TABLE IF NOT EXISTS items (...)` plus an `updated_at` maintenance approach. Seed ~8 sample rows only if the table is empty.
- Health endpoints: `GET /healthz` returns 200 **without touching the DB** (liveness). `GET /readyz` runs `SELECT 1` and returns 200 or 503 (readiness).
- Add an `X-Pod` response header set to `process.env.HOSTNAME` on `/api` responses, so load-balancing across pods is visible during a demo.
- Configurable CORS via env `ALLOW_ORIGIN` (default off / same-origin) so local dev works.
- Listen on `PORT` (default 3000).
- Dockerfile: `node:20-alpine`, install production deps only, run as a non-root user, `EXPOSE 3000`.

## Frontend — React + Vite, served by nginx
- A clean, minimal, genuinely usable UI (plain CSS or very light styling — not a heavy component framework):
  - Items table (name, sku, category, quantity, price) with a search box.
  - Add item (form), edit item (form or modal), delete (with a confirm step).
  - Inline quantity +/- adjust buttons.
  - Proper loading, error, and empty states.
- Talk to the API via the **relative path `/api`** (same origin in production, routed by the ingress). In dev, configure a **Vite proxy** from `/api` to `http://localhost:3000`.
- **Multi-stage Dockerfile**: stage 1 (`node:20-alpine`) builds the static bundle; stage 2 (`nginx:alpine`) serves it from `/usr/share/nginx/html`. Include an `nginx.conf` with SPA fallback (`try_files $uri /index.html`). nginx listens on 80. Do NOT proxy `/api` in nginx — the Kubernetes ingress handles that routing.

## Kubernetes manifests (`k8s/`, plain YAML, no Helm)
Use image placeholders `<REGISTRY>/ims-backend:latest` and `<REGISTRY>/ims-frontend:latest`.
- `backend-deployment.yaml` — 2 replicas; `envFrom` a ConfigMap and a Secret; liveness probe on `/healthz`, readiness probe on `/readyz`; small resource requests/limits; `runAsNonRoot`.
- `backend-service.yaml` — ClusterIP, port 80 → targetPort 3000.
- `frontend-deployment.yaml` — 2 replicas; liveness/readiness probe on `/`; small resources.
- `frontend-service.yaml` — ClusterIP, port 80.
- `configmap.yaml` — `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_SSL` (placeholder values).
- `secret.yaml` — `DB_PASSWORD` (placeholder; add a comment noting values are base64-encoded).
- `ingress.yaml` — nginx ingress; path `/` → frontend service, path `/api` → backend service; include a comment showing where TLS / cert-manager annotations would go.

## Local development (`docker-compose.yml`)
Bring the whole system up locally with one command, so it can be verified before any cloud work:
- `postgres` (`postgres:16-alpine`) with env config and a healthcheck.
- `backend` (build `./backend`) with env pointing at the `postgres` service; `depends_on` postgres healthy.
- `frontend` (build `./frontend`) exposed on `http://localhost:8080`.
- Goal: `docker compose up` yields a working IMS at `http://localhost:8080`.

## README.md
- What it is; a short text architecture overview; the stateless / external-DB design note.
- Local run (`docker compose up`).
- Build and push images.
- Deploy to Kubernetes (apply order; what to fill in: ConfigMap, Secret, registry, ingress host).
- Full API reference with sample `curl` commands.
- Environment variable reference table.

## Quality bar
Working and correct over flashy. Sensible validation and error handling, clean readable code, minimal dependencies, raw SQL over a heavy ORM. Comment the parts that matter for deployment (env config, graceful shutdown, probes). When finished, print the local run and deploy instructions.