# HundunOS v3.0 - Docker 编译脚本

.PHONY: help build up down restart logs clean test install-deps pull

# 默认目标
help:
	@echo "HundunOS Docker 管理脚本"
	@echo ""
	@echo "可用命令:"
	@echo "  make help           - 显示帮助信息"
	@echo "  make build          - 构建 Docker 镜像"
	@echo "  make up             - 启动所有服务"
	@echo "  make down           - 停止所有服务"
	@echo "  make restart        - 重启服务"
	@echo "  make logs           - 查看日志"
	@echo "  make clean          - 清理所有容器和镜像"
	@echo "  make test           - 运行测试"
	@echo "  make install-deps   - 安装 Ollama 模型"
	@echo "  make pull           - 拉取最新的 Docker 镜像"

# 构建 Docker 镜像
build:
	@echo "构建 HundunOS Docker 镜像..."
	docker-compose build

# 启动服务
up:
	@echo "启动 HundunOS 服务..."
	docker-compose up -d

# 停止服务
down:
	@echo "停止 HundunOS 服务..."
	docker-compose down

# 重启服务
restart: down up
	@echo "服务已重启"

# 查看日志
logs:
	docker-compose logs -f

# 清理
clean:
	@echo "清理所有容器和镜像..."
	docker-compose down -v
	docker system prune -f

# 运行测试
test:
	@echo "运行测试..."
	docker-compose run --rm hundunos npm test

# 安装 Ollama 模型
install-deps:
	@echo "安装 Ollama 模型..."
	docker-compose exec ollama ollama pull qwen2.5:1.5b
	docker-compose exec ollama ollama pull llama3.2:3b

# 拉取最新镜像
pull:
	@echo "拉取最新的 Docker 镜像..."
	docker-compose pull
