# syntax=docker/dockerfile:1

# Node 24 is mandatory: the persistence layer uses the built-in node:sqlite.
FROM node:24-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
# Baileys' preinstall and protobufjs' postinstall must run, so scripts stay on.
RUN npm ci --omit=dev && npm cache clean --force


FROM node:24-alpine AS runtime

# ffmpeg (and the ffprobe it ships) supply video thumbnails, dimensions, and
# duration. Media still sends without them; only those preview fields go blank.
# tini reaps zombies and forwards SIGTERM so graceful shutdown runs.
RUN apk add --no-cache ffmpeg tini

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node index.js package.json package-lock.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts

# Credentials and the idempotency ledger live here. Mount a volume over it or
# every restart loses the WhatsApp link.
RUN mkdir -p /app/session && chown node:node /app/session && chmod 700 /app/session

ENV NODE_ENV=production \
    PORT=3000

USER node
EXPOSE 3000
VOLUME ["/app/session"]

# Reports 503 until the WhatsApp socket is linked, so the container is only
# "healthy" once it can actually send.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]
