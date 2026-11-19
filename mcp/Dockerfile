FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /bin/uv

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

# Dependencies first (layer cached as long as the lockfile doesn't change).
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY server.py client.py ./

# FastMCP listens on 127.0.0.1 by default: unreachable from Caddy.
ENV MCP_HOST=0.0.0.0

RUN useradd --create-home app
USER app
EXPOSE 8000

# Transport Streamable HTTP, endpoint /mcp.
CMD ["uv", "run", "--no-sync", "server.py"]
