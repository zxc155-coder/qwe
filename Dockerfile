# VIBE CLOUD — combined API + Telegram bot for Fly.io
FROM node:22-bookworm-slim AS deps

# better-sqlite3 needs a C++ toolchain to compile native bindings
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install only root deps (web is built locally before deploy and is NOT served from this container)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev


FROM node:22-bookworm-slim AS runner

# Runtime deps for sqlite
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=3001

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY api ./api
COPY bot ./bot
COPY db  ./db

# Persistent volume mount-point for sqlite + uploaded receipts
RUN mkdir -p /data/db /data/db/receipts
ENV DB_PATH=/data/db/vibe_cloud.sqlite

EXPOSE 3001

# Seed products + reviews on first boot if DB is missing, then launch bot+API.
CMD sh -c '\
  if [ ! -f "$DB_PATH" ]; then \
    echo "[boot] seeding fresh DB..."; \
    node db/seedProducts.js && node db/seedReviews.js; \
  fi; \
  node bot/index.js'
