# syntax=docker/dockerfile:1
#
# Vite compiles to static files, so the runtime image is a web server and
# nothing else — no Node, no npm, no source. Caddy terminates TLS in front of
# this and proxies /api to the backend, so this stage is plain HTTP on the
# internal Compose network and never faces the internet directly.

# ── Build ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /build

# Lockfile-only layer, same reasoning as the Maven stage: npm ci re-runs only
# when dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* at BUILD time — these are not runtime configuration, and
# changing them means rebuilding the image. The default base URL is relative on
# purpose: the SPA and the API are served from one origin through Caddy, so the
# browser never makes a cross-origin request and CORS never enters the picture.
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_APP_NAME="Event Booking Cambodia"
ARG VITE_DEFAULT_CURRENCY=USD
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_APP_NAME=$VITE_APP_NAME \
    VITE_DEFAULT_CURRENCY=$VITE_DEFAULT_CURRENCY

# `npm run build` is eslint-then-vite (see package.json). A lint error fails the
# image build, which is deliberate: the alternative is shipping and finding out.
RUN npm run build

# ── Runtime ────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost/ || exit 1
