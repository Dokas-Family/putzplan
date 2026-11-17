# Stufe 1: App bauen und testen. Schlägt ein Test fehl, entsteht kein Image und der alte Stand läuft weiter.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm test

# Stufe 2: nur das, was zum Laufen nötig ist
FROM node:24-alpine
# ffmpeg: Standbilder aus Videos, damit Claude sich die Videos ansehen kann
RUN apk add --no-cache tzdata ffmpeg
WORKDIR /app
LABEL app=putzplan
# Kurze Git-Kennung des Standes, wird von scripts/deploy.sh mitgegeben und in der App unter „Ich“ angezeigt
ARG GIT_SHA=dev
ENV NODE_ENV=production TZ=Europe/Berlin PORT=8080 DATA_DIR=/data APP_VERSION=$GIT_SHA
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY shared ./shared
# Quelltext der App, damit Claude im Chat nachlesen kann, wie etwas funktioniert (nur lesen)
COPY web/src ./web/src
COPY test ./test
COPY scripts ./scripts
COPY README.md Dockerfile docker-compose.yml vite.config.js ./
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server/index.js"]
