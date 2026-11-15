# BrandGuard AI Integration Service

Independent Claude-powered semantic review, claim verification, visual review, fix generation, and independent fix validation microservice for BrandGuard, backed by **MongoDB** for evaluation datasets, claims, guidelines, and evaluation run history.

## Setup & Local MongoDB

```powershell
cd brandguard-ai
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
docker compose up -d mongodb
```

## Seed Real Non-Testimonial Datasets into MongoDB

```powershell
python -m scripts.seed_mongo
# Or load your own real dataset JSON file:
python -m scripts.seed_mongo --file path\to\real_cases.json
```

## Run Server & Evaluation

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
python -m scripts.run_eval
```

## Run Tests

```powershell
python -m pytest -v
```
