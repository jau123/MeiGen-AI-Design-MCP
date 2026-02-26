FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install
COPY src/ ./src/
COPY data/ ./data/
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY bin/ ./bin/
ENV NODE_ENV=production
ENTRYPOINT ["node", "bin/meigen-mcp.js"]
