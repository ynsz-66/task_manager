.PHONY: up down restart logs ps dev dev-down test-api

up: .env
	@docker network inspect proxy >/dev/null 2>&1 || docker network create proxy
	docker compose up -d --build

down:
	docker compose down

restart: down up

logs:
	docker compose logs -f

ps:
	docker compose ps

.env:
	@echo "Missing .env file: cp .env.example .env then set API_TOKEN" && exit 1

MONGO_DEV := task-manager-mongo-dev

dev: backend/.env
	@docker start $(MONGO_DEV) >/dev/null 2>&1 || docker run -d --name $(MONGO_DEV) -p 27017:27017 mongo:8 >/dev/null
	@echo "Mongo :27017 | API :3000 | Vite :5173  (Ctrl+C to stop everything)"
	@trap 'kill 0' INT TERM; \
	(cd backend && npm run dev) & \
	(cd frontend && npm run dev) & \
	(cd mcp && uv run server.py) & \
	wait

dev-down:
	docker rm -f $(MONGO_DEV)

backend/.env:
	@echo "Missing backend/.env file: cp backend/.env.example backend/.env" && exit 1

