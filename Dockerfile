FROM node:24-slim AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile
COPY src/ ./src/
RUN pnpm build

FROM node:24-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/dist ./dist
COPY bin/ ./bin/
ENV NODE_ENV=production
USER node
ENTRYPOINT ["node", "bin/meigen-mcp.js"]
