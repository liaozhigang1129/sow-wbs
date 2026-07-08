# ====== SOW→WBS 单体镜像 ======
# 分两阶段：
#   1) builder: 装依赖 + 构建前端
#   2) runtime: 只装生产依赖 + 跑后端（后端同时托管 API + dist/ 静态资源）

# ---------- Stage 1: build ----------
FROM node:20-alpine AS builder
WORKDIR /app

# 仅复制清单文件，最大化缓存命中
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json

# 安装全量依赖（含 dev，构建前端要 vite/tailwind/postcss）
RUN npm install --no-audit --no-fund \
 && cd client && npm install --no-audit --no-fund && cd ..

# 复制源码并构建前端
COPY . .
RUN npm run build:client

# ---------- Stage 2: runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app

# 加 curl 给 HEALTHCHECK 用
RUN apk add --no-cache curl tini

ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0

# 复制清单 + 装生产依赖（跳过根 devDependencies）
COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund

# 复制运行所需源码 + 构建产物
COPY server ./server
COPY public ./public
COPY config ./config
COPY bin ./bin
COPY --from=builder /app/dist ./dist

# .env 允许在运行时挂载 / 用环境变量覆盖
COPY .env.example ./.env.example

# 暴露端口
EXPOSE 8787

# 健康检查：探测 /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8787/api/health || exit 1

# tini 收僵尸进程 + 转发信号
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/src/index.js"]
