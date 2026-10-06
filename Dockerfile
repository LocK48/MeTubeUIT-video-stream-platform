FROM node:22-bookworm-slim AS node-deps
WORKDIR /app
COPY api_server/package.json api_server/package-lock.json ./api_server/
COPY worker_server/package.json worker_server/package-lock.json ./worker_server/
RUN npm ci --prefix api_server --omit=dev \
    && npm ci --prefix worker_server --omit=dev

FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=node-deps /app/api_server/node_modules ./api_server/node_modules
COPY --from=node-deps /app/worker_server/node_modules ./worker_server/node_modules
COPY --chown=node:node api_server/package.json ./api_server/package.json
COPY --chown=node:node api_server/server.js ./api_server/server.js
COPY --chown=node:node api_server/src ./api_server/src
COPY --chown=node:node worker_server/package.json ./worker_server/package.json
COPY --chown=node:node worker_server/src ./worker_server/src
RUN mkdir -p /app/api_server/src/logs \
    && chown -R node:node /app/api_server/src/logs
USER node
CMD ["node", "api_server/server.js"]

FROM node:22-bookworm-slim AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=node-deps /app/api_server/node_modules ./api_server/node_modules
COPY --from=node-deps /app/worker_server/node_modules ./worker_server/node_modules
COPY --chown=node:node api_server/package.json ./api_server/package.json
COPY --chown=node:node api_server/src ./api_server/src
COPY --chown=node:node worker_server/package.json ./worker_server/package.json
COPY --chown=node:node worker_server/worker.js ./worker_server/worker.js
COPY --chown=node:node worker_server/src ./worker_server/src
USER node
CMD ["node", "worker_server/worker.js"]

FROM node:24-bookworm-slim AS frontend-build
WORKDIR /workspace
COPY frontend/Metube-UI/package.json frontend/Metube-UI/package-lock.json ./frontend/Metube-UI/
RUN npm install --prefix frontend/Metube-UI --package-lock-only --ignore-scripts --no-audit --no-fund \
    && npm ci --prefix frontend/Metube-UI --no-audit --no-fund
COPY frontend/Metube-UI/ ./frontend/Metube-UI/
COPY api_server/src ./api_server/src
COPY worker_server/src ./worker_server/src
COPY --from=node-deps /app/api_server/node_modules ./api_server/node_modules
WORKDIR /workspace/frontend/Metube-UI
RUN npm run build

FROM nginx:alpine AS frontend
COPY --from=frontend-build /workspace/frontend/Metube-UI/dist /usr/share/nginx/html
COPY frontend/Metube-UI/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
