# --- deps: install once, reused by build and prod stages ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build: compile TypeScript + generate Prisma client ---
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prisma.config.ts requires DATABASE_URL to be resolvable even for `generate`,
# which never actually connects to a database — a placeholder is enough here.
# The real DATABASE_URL is supplied at container runtime, not at build time.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate
RUN npm run build

# --- production: slim runtime image ---
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma

# Don't run as root: the official image ships an unprivileged "node" user.
USER node

EXPOSE 3000

# Run node directly (not via npm) so SIGTERM reaches the app's graceful shutdown.
CMD ["node", "dist/server.js"]
