# Stockhausen Agent Backend

Local FastAPI service that exposes:

- `GET /health`
- `POST /transpose` — music-theory transposition via `music21`
- `POST /agent/chat` — Claude tool-use chat with the theory engine

This service runs **on the maintainer's machine** at `127.0.0.1:8000` by default.
Nothing here is exposed to the network.

## Setup

Requires Python 3.12+ and [`uv`](https://docs.astral.sh/uv/) installed.

```bash
cd backend/agent
uv sync                                   # install deps into .venv
cp .env.example .env                      # then edit .env with your Anthropic key
uv run uvicorn app.main:app --reload --port 8000
```

Then visit http://127.0.0.1:8000/health.

## Layout

```
backend/agent/
├── app/
│   ├── main.py                  # FastAPI app factory
│   ├── config.py                # settings (env-driven)
│   ├── routes/
│   │   ├── health.py
│   │   ├── transpose.py
│   │   └── chat.py
│   ├── tools/
│   │   └── theory.py            # analyze_key, ...
│   └── llm/
│       └── anthropic_client.py
├── tests/
└── pyproject.toml
```
