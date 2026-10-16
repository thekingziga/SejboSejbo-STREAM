# Working context (`live` branch)

## Site and deployment

- Project: **SEJBOSEJBO.TV (`sejbosejbo-live`)**, Node/Express + WebSocket (`ws`) + SQLite WAL live streaming application, current source version `1.1.0`.
- GitHub Repository: `https://github.com/thekingziga/SejboSejbo-STREAM.git`
  - `main`: Clean, self-hostable public template branch (with `.env.example`, `docker-compose.yml`, `LICENSE`, `docs/api.md`, and generic host defaults).
  - `live`: Personal homelab/production branch with build/deploy tooling for the Lenovo Docker host.
- Production Docker host: `192.168.69.29` (user `ldocker`, build path `/home/ldocker/docker_build_images/sejbosejbo-stream`).
- Docker Hub repository: `thekingziga/sejbosejbo-stream` (`1.0.0`, `1.1.0`, `latest`).

## Commands

- Build & push to Docker Hub via remote Docker host (requires `DOCKER_PASSWORD` in env, never committed):
  ```bash
  DOCKER_PASSWORD=... node deploy/build-and-push.js
  ```
- Create & publish a GitHub Release with exact versioned `.tar.gz` and `.zip` source code bundles:
  ```bash
  node scripts/release.js
  ```
