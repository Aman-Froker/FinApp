# Build context is the monorepo root: docker build -f apps/api/Dockerfile .
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @finapp/api...
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @finapp/api build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /repo/.npmrc ./
COPY --from=build /repo/packages/config/package.json packages/config/
COPY --from=build /repo/packages/shared/package.json packages/shared/
COPY --from=build /repo/apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod --filter @finapp/api...
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/migrations apps/api/migrations
COPY --from=build /repo/apps/api/migrate-mongo-config.cjs apps/api/
USER node
EXPOSE 3000
WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]
