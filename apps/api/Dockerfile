FROM node:22-bookworm-slim AS dependencies
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM dependencies AS build
COPY . .
ENV DATABASE_URL=mysql://build:build@127.0.0.1:3306/build
RUN npm run db:generate -w @frostguard/api
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/package.json ./package.json
COPY --from=build --chown=node:node /workspace/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /workspace/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /workspace/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /workspace/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /workspace/database/sql ./database/sql
WORKDIR /workspace/apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=5 CMD node -e "fetch('http://127.0.0.1:4000/health/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/server.js"]

FROM dependencies AS migrate
COPY . .
ENV DATABASE_URL=mysql://build:build@127.0.0.1:3306/build
RUN npm run db:generate -w @frostguard/api
WORKDIR /workspace
USER node
CMD ["sh", "-c", "npm run db:deploy -w @frostguard/api && npm run db:sql -w @frostguard/api"]
