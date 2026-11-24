# 🎵 Pitch Lab

Pitch Lab is a web app (PWA) for learning **music fundamentals** and training **absolute pitch**. The pitch trainer follows the most recent adult training research:
- Wong et al. 2020, *Attention, Perception & Psychophysics*
- Wong et al. 2025, *Psychonomic Bulletin & Review*
- Van Hedger, Heald & Nusbaum 2019, *PLoS One*

## Features (roadmap)
- **Absolute-pitch trainer.**
  - **Ladder:** a pitch-class naming ladder grows from 3 to 12 pitches across 3 octaves and 3 instruments (piano, violin, clarinet). Each step is played first with feedback, then without, and passes at 90% with semitone errors counted as wrong.
  - **Shepard interference:** a sliding tone before no-feedback steps blocks relative-pitch strategies.
  - **Out-of-set notes:** from 4 pitches on, notes outside the set are mixed in and must be answered "Not in my set".
  - **Adaptive practice:** feedback steps play confused notes more often and confused pairs back to back.
  - **Focus drill:** every 10 passed levels, a compulsory drill on the weakest note.
  - **Speed tiers:** the response window shrinks from 3.5 s to 2.5 s to 2.0 s.
  - **Mastery:** the final level must be passed 4×, the last pass at least 12 h after the third.
- **Assessment.**
  - **Tests:** a baseline test, then weekly, final and 1- and 3-month retention tests. All are without feedback, over octaves 3–6, with a trained and an untrained instrument (harp), and consecutive notes more than an octave apart.
  - **Classification:** results get an indicative AP-level band.
  - **Pitch memory:** an optional check after Van Hedger et al. 2019.
- **Motivation.** Points (⭐ trials score 3), a daily goal (30 min), a weekly goal (5 h), a streak, and progress charts.
- **Fundamentals.** Notes and staff reading, intervals, scales, keys, chords and rhythm, with FSRS spaced repetition for the facts.
- **Offline-first.** Every trial is stored locally in IndexedDB and synced to the API when online.

## Tech stack
- **Frontend:** Vue 3, Vite, TypeScript, Pinia, Vue Router, Web Audio API, Dexie, `tonal`, VexFlow, `ts-fsrs`, vite-plugin-pwa, Vitest, Playwright
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
npm test                                      # Vitest: protocol, sequencer, runner, scoring, audio, IndexedDB
npm run test:e2e                              # Playwright: onboarding → pretest → training in headless Chromium
```

### Instrument samples
Training uses real recordings of piano, violin and clarinet. Harp is the untrained timbre in tests. All come from [VSCO-2 Community Edition](https://github.com/sgossner/VSCO-2-CE) (CC0 / redistributable). To build them:
```bash
sudo apt install ffmpeg                       # once
cd frontend && npm run samples                # download → verify pitch → trim/normalise → .ogg + .m4a
```
The script checks every note with an f0 estimator, fixes mislabelled octaves, and rejects notes more than 35 cents off. Smaller deviations are stored and corrected at playback. It writes `public/samples/<instrument>-v1/` and `src/audio/sampleSets.ts`. Until these exist, the app falls back to synthesized timbres.
To check headphones, volume, interference sounds and reaction-time measurement, open `/audio-check`.

## Deployment
See [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md).

## License
MIT
