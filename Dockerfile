# Mylemans Online — OBS Scene Pack server
FROM node:20-alpine

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json ./
RUN npm install --omit=dev

# App source
COPY server ./server
COPY public ./public

# Mount your music library here (read-only is fine)
VOLUME ["/music"]

ENV PORT=8080 \
    MUSIC_DIR=/music \
    NODE_ENV=production

EXPOSE 8080

# now-playing.txt lives in the scenes dir and is written at runtime
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s \
  CMD wget -qO- http://localhost:8080/api/now-playing >/dev/null 2>&1 || exit 1

CMD ["node", "server/server.js"]
