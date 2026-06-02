# syntax=docker/dockerfile:1
# Mylemans Online — OBS Scene Pack server

# ---- deps: install node_modules once on the BUILD platform ----
# Our dependencies (express, music-metadata) are pure JS with no native
# addons, so the installed tree is arch-independent. Pinning this stage to
# $BUILDPLATFORM avoids running npm under slow QEMU emulation for arm64.
FROM --platform=$BUILDPLATFORM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# BuildKit cache mount keeps the npm cache warm across builds.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# ---- runner: final per-architecture image ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    MUSIC_DIR=/music

COPY --from=deps /app/node_modules ./node_modules
COPY package.json config.json ./
COPY server ./server
COPY public ./public

# Mount your music library here (read-only is fine)
VOLUME ["/music"]

EXPOSE 8080

# now-playing.txt lives in the scenes dir and is written at runtime
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s \
  CMD wget -qO- http://localhost:8080/api/now-playing >/dev/null 2>&1 || exit 1

CMD ["node", "server/server.js"]
