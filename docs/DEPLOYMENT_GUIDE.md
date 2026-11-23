# Pitch Lab: Deployment Guide (Pi K3s cluster)

Pitch Lab deploys the same way as SnapDeck, OpScout and Pagi:

```
GitHub (main) ──CI──► GHCR images (amd64+arm64) ──tag bump commit──► k8s/ ──ArgoCD──► namespace pitchlab
                                                                                         │
Cloudflare tunnel ─► Traefik ─► pitchlab.cloud-test.dev      → pitchlab-frontend (nginx, PWA + samples)
                               pitchlab-api.cloud-test.dev  → pitchlab-backend  (Go, :8080)
                                                                     │
                                         postgresql.core-infra.svc.cluster.local:5432 / db pitchlab / schema pitchlab
```

## One-time setup

### 1. GitHub repository
Create `jonnyCap/pitch-lab` and push `main`. The workflow `.github/workflows/deploy.yml` runs these steps:
1. Backend tests: gofmt, vet, and race tests against a Postgres service container.
2. Frontend checks: lint, API-type freshness, Vitest and build.
3. Builds `ghcr.io/jonnycap/pitchlab-{backend,frontend}` for amd64 and arm64.
4. Commits the new image tags into `k8s/*-deployment.yaml`.

### 2. Database user and database in the shared Postgres
The postgres init script in `pi-infra/core-infra/postgresql` only runs when the volume is first created, so create the database once by hand:

```bash
PG_POD=pod/postgresql-0
kubectl -n core-infra exec -i "$PG_POD" -- sh -c 'psql -U "$POSTGRES_USER" -d postgres' <<'SQL'
CREATE USER pitchlab WITH ENCRYPTED PASSWORD '<strong-password>';
CREATE DATABASE pitchlab OWNER pitchlab;
GRANT ALL PRIVILEGES ON DATABASE pitchlab TO pitchlab;
SQL
```

So the database is recreated on a cluster rebuild, also add `pitchlab:<strong-password>:pitchlab` to `POSTGRES_MULTIPLE_DATABASES` in `pi-infra/core-infra/postgresql/databases-sealed-secret.yaml`. Use `pi-infra/scripts/seal.sh` to do this.

You don't need to create the `pitchlab` schema. The backend creates it and runs all goose migrations on startup, under a Postgres advisory lock.

### 3. Secrets
```bash
cp .env.prod.example .env.prod      # fill in DATABASE_URL password, SECRET_KEY (openssl rand -hex 32), GHCR_PAT
./seal-env.sh .env.prod             # writes k8s/sealed-secret.yaml and enables it in k8s/kustomization.yaml
git add k8s/sealed-secret.yaml k8s/kustomization.yaml && git commit -m "chore: seal production secrets"
```
This produces `pitchlab-secret` (the app env) and `ghcr-creds` (the image pull secret) in namespace `pitchlab`.

### 4. ArgoCD application
`pi-infra/apps/pitchlab.yaml` watches `jonnyCap/pitch-lab` at path `k8s`, and is listed in `pi-infra/apps/kustomization.yaml`. Commit and push pi-infra, and the root app-of-apps picks it up.

## Verify a deployment
```bash
kubectl -n argocd get application pitchlab          # Synced / Healthy
kubectl -n pitchlab get pods
curl -s https://pitchlab-api.cloud-test.dev/healthz  # {"status":"ok"}
curl -s https://pitchlab-api.cloud-test.dev/readyz   # {"status":"ok"} (DB reachable)
curl -sI https://pitchlab.cloud-test.dev/sw.js | grep -i cache-control   # no-cache
```

## Resource footprint
| Component | Request | Limit | Image |
|---|---|---|---|
| backend (Go, distroless, non-root, read-only FS) | 10m / 16Mi | 500m / 128Mi | ~23 MB |
| frontend (nginx) | 20m / 32Mi | 200m / 128Mi | ~nginx:alpine + bundle |

## Local development
```bash
docker compose up -d db                     # Postgres 16 on localhost:5434
cd backend && make test                     # unit tests
make -C backend test-integration            # all tests inside the db container's network namespace
cd frontend && npm install && npm run dev   # http://localhost:5173
```
`test-integration` runs inside the db container's network namespace. It works even when a VPN blocks Docker bridge networking or host port forwarding, which is a known issue on this machine.
