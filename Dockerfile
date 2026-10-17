# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm build \
 && find .output/server/node_modules -path '*/prebuilds/*' -name '*.node' ! -name 'linuxmusl-*' -delete

# The Nitro output is self-contained (dependencies and better-sqlite3 prebuilds are traced into it).
FROM alpine:3.22
RUN apk add --no-cache libstdc++ \
 && addgroup -g 1000 node && adduser -u 1000 -G node -s /bin/sh -D node \
 && mkdir -p /data && chown node:node /data
# Only the node binary: the base image's npm and yarn are not needed to run the server.
COPY --from=build /usr/local/bin/node /usr/local/bin/node
ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    DBLOCAL_IN_DOCKER=1 \
    NITRO_PORT=5555 \
    DBLOCAL_DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/.output ./.output
USER node
VOLUME /data
EXPOSE 5555
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5555/api/health || exit 1
CMD ["node", ".output/server/index.mjs"]
