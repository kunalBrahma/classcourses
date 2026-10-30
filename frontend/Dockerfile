# syntax=docker/dockerfile:1
# Student site. Built in GitHub Actions and pushed to GHCR; the VPS only pulls
# and runs it (docker-compose.prod.yml). Never build this on the shared VPS.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* are inlined into the browser bundle, so they are build args.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
# Where `next build` reads the catalog while prerendering. The build runs in CI,
# outside the VPS, so this is the public API; at runtime compose sets the
# private address (http://backend:3000). The API must be up: with it down the
# readers' short-lived fallbacks can't be prerendered and the build fails
# (which leaves the running site alone). CI deploys the API first for this.
ARG API_INTERNAL_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_TELEMETRY_DISABLED=1
# The build's ~400 catalog reads would trip the API's per-IP limit, so they send
# INTERNAL_API_KEY. A BuildKit secret: never stored in an image layer.
RUN --mount=type=secret,id=internal_api_key,env=INTERNAL_API_KEY npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Unprivileged user; it owns .next so the runtime cache can be written.
USER node
EXPOSE 3000
CMD ["node", "server.js"]
