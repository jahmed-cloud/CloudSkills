# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime
LABEL org.opencontainers.image.title="CloudSkills" \
      org.opencontainers.image.description="Read-only cloud architecture evidence and MCP tools"
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node mcp ./mcp
COPY --chown=node:node src ./src
RUN mkdir -p /app/knowledge/organization && chown -R node:node /app/knowledge
USER node
ENV NODE_ENV=production MCP_HOST=0.0.0.0 MCP_PORT=3000
EXPOSE 3000
CMD ["node", "src/server.js", "--transport", "http"]
