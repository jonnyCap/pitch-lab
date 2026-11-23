# 🎵 Pitch Lab

Pitch Lab is a web app (PWA) for learning **music fundamentals** and training **absolute pitch**. The pitch trainer follows the most recent adult training research:
- Wong et al. 2020, *Attention, Perception & Psychophysics*
- Wong et al. 2025, *Psychonomic Bulletin & Review*
- Van Hedger, Heald & Nusbaum 2019, *PLoS One*

## Features (roadmap)
- **Absolute-pitch trainer.** A pitch-class naming ladder that grows from 3 to 12 pitches over 3 octaves and several timbres, with a 90% mastery gate. Each step has a feedback block followed by a no-feedback block. Shepard-glissando interference blocks relative-pitch strategies, and response deadlines tighten from 5 s to 2 s. Also includes adaptive confusion-pair practice, retention tests and AP-level assessment.
- **Fundamentals.** Notes and staff reading, intervals, scales, keys, chords and rhythm, with FSRS spaced repetition for the facts.
- **Offline-first.** Every trial is stored locally in IndexedDB and synced to the API when online.

## Tech stack
- **Frontend:** Vue 3, Vite, TypeScript, Pinia, Vue Router, Web Audio API, Dexie, `tonal`, VexFlow, `ts-fsrs`, vite-plugin-pwa
- **Backend:** Go 1.26, chi, pgx/v5, goose migrations (embedded), slog. It's a thin API for auth, sync and stats.
- **Database:** PostgreSQL 16 (shared cluster instance, schema `pitchlab`)
- **Deployment:** K3s on a Raspberry Pi, ArgoCD, Sealed Secrets, Traefik, Cloudflare tunnel, multi-arch GHCR images

## Repository layout
```
backend/    Go API (cmd/server, internal/{config,db,http}, api/openapi.yaml)
frontend/   Vue PWA (src/{audio,music,data,views,components})
k8s/        Kustomize manifests (ArgoCD watches this folder)
docs/       Deployment guide
```

## Local development
```bash
docker compose up -d db                       # Postgres 16 → localhost:5434
make -C backend test                          # Go unit tests
make -C backend test-integration              # + DB integration tests
cd frontend && npm install && npm run dev     # http://localhost:5173
npm test                                      # Vitest (pitch maths, tuning ±5 cents, interference, timing, IndexedDB)
```
To check headphones, volume, interference sounds and reaction-time measurement, open `/audio-check`.

## Deployment
See [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md).

## License
MIT
