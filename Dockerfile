# ─────────────────────────────────────────────────────────────
# Dropra — production Dockerfile (multi-stage)
# Railway auto-detects this file. One image, one process, one container.
# ─────────────────────────────────────────────────────────────

# 1. Build stage: install all deps and compile TypeScript.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
# Build tools for native modules (better-sqlite3) if a prebuild is unavailable.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# 2. Production dependencies only (native modules compiled against node:22).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 3. Runtime image: small, production-only.
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
	DATA_DIR=/data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
COPY public ./public

# Persistent data lives on the Railway Volume mounted at /data.
# Railway rejects the Docker VOLUME instruction — attach the Volume in the
# service settings instead. The app creates DATA_DIR on boot if missing.
RUN mkdir -p /data

# Railway provides PORT at runtime; this is only a local-dev default.
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
