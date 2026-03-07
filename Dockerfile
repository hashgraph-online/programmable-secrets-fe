ARG NODE_VERSION=24-bookworm-slim

FROM node:${NODE_VERSION} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install build tools required by native npm packages
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

COPY package.json pnpm-lock.yaml* ./
# If no pnpm-lock.yaml, fall back to npm-based install converted to pnpm
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store && \
  (pnpm install --frozen-lockfile --prefer-offline 2>/dev/null || pnpm install --no-frozen-lockfile)

# Copy source and build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  --mount=type=cache,id=ps-next-cache,target=/app/.next/cache \
  NODE_OPTIONS="--max-old-space-size=1200" pnpm run build

FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=build --chown=node:node /app/.next/standalone/ ./
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/static ./.next/static

# Create data dir for ciphertext storage
RUN mkdir -p /app/data/programmable-secrets && chown -R node:node /app/data

USER node

EXPOSE 3000

CMD ["node", "server.js"]
