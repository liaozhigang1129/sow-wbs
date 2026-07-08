# Docker 部署指南

> 单体镜像：构建前端 → 后端同时托管 API（8787）+ 静态资源。

## 0. 先决条件

- Docker 24+ / Docker Compose v2
- 网络可拉基础镜像 `node:20-alpine`（若走代理，请先在 Docker Desktop → Settings → Docker Engine 配置 `registry-mirrors`）
- 推荐 ≥ 2 GB 空闲磁盘、≥ 1 GB 内存

## 1. 一键启动（推荐）

```bash
# 1) 准备环境变量（把示例复制成 .env，按需修改）
cp .env.docker.example .env

# 2) 构建 + 后台启动
docker compose up -d --build

# 3) 看日志
docker compose logs -f

# 4) 健康检查
curl http://localhost:8787/api/health
# → {"ok":true,"ts":...}
```

启动成功后访问：

- 前端：<http://localhost:8787/>
- 健康检查：<http://localhost:8787/api/health>
- 兜底 LLM 状态：<http://localhost:8787/api/llm-default>
- OpenAPI：<http://localhost:8787/api/v1/docs>

## 2. 端口 / 主机名

`docker-compose.yml` 默认把容器 8787 映射到宿主机 8787。要改宿主机端口（如避免冲突）：

```bash
# 方式 A：.env 里改
HOST_PORT=9080

# 方式 B：直接覆盖
HOST_PORT=9080 docker compose up -d
```

## 3. 配置 LLM

`.env` 里的关键变量（已用 hexai 兜底示例值）：

| 变量 | 说明 | 默认值 |
|---|---|---|
| `HEXAI_BASE_URL` | hexai 兼容 OpenAI 协议的 baseUrl | `https://crs.hexai.cn/api/v1` |
| `HEXAI_API_KEY` | hexai API Key（容器内**不外露**，前端用占位符走兜底） | 空 |
| `HEXAI_MODEL` | 默认模型 | `claude-sonnet-4-20250514` |

> 不填 `HEXAI_API_KEY` 时，调用 `/api/generate` 会自动降级到 mock 生成。
> 想用别的厂商，编辑 `docker-compose.yml` 取消对应环境变量注释即可。

## 4. 常用命令

```bash
# 重建并启动
docker compose up -d --build

# 停止 / 启动
docker compose stop
docker compose start

# 删除容器（保留镜像）
docker compose down

# 看实时日志
docker compose logs -f app

# 进容器调试
docker compose exec app sh

# 清理所有（容器+网络+镜像）
docker compose down --rmi all
```

## 5. 故障排查

| 症状 | 排查 |
|---|---|
| `failed to resolve source metadata for node:20-alpine` | Docker 拉不到基础镜像，配置 `registry-mirrors` 或重试 |
| 启动后 `/api/health` 不通 | `docker compose ps` 看 `STATUS`；`docker compose logs app` 查启动报错 |
| `/api/llm-default` 返回 `apiKeyPresent:false` | `.env` 里没设 `HEXAI_API_KEY`，调用时会降级到 mock |
| 前端 fetch 报 CORS | 后端默认 `app.use(cors())` 全放开；若是 Nginx 反代需保留 `Host` 头 |
| 容器重启后数据丢失 | 默认无持久化，挂 `- ./uploads:/app/uploads` 之类 volume |

## 6. 升级 / 重新部署

```bash
git pull
docker compose build --pull       # 重建时同时拉新基础镜像
docker compose up -d
```

## 7. 镜像大小 / 性能

- 镜像 ≈ 400 MB（`node:20-alpine` + 生产依赖 + 编译后前端）
- 启动时间 ≈ 2-3 秒（无外部 DB 依赖）
- 单进程，建议加 Nginx 反代做 TLS + 限流
