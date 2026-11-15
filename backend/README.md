# BrandGuard Backend

FastAPI + PostgreSQL (`pgvector`) + Redis + S3/MinIO backend for BrandGuard.

## Quick Start (Docker)

```bash
cp .env.example .env
docker compose up --build
```

- API Docs: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/health`
- MinIO Console: `http://localhost:9001`

## Local Development

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

## Running Tests

```bash
pytest
```

