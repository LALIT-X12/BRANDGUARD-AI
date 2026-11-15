from datetime import datetime, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class MongoDatasetStore:
    """Async MongoDB store for real evaluation datasets, claims, guidelines, and eval runs."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._client: AsyncIOMotorClient | None = None

    def _get_db(self) -> AsyncIOMotorDatabase:
        if self._client is None:
            self._client = AsyncIOMotorClient(
                self.settings.MONGODB_URI,
                serverSelectionTimeoutMS=3000,
            )
        return self._client[self.settings.MONGODB_DB_NAME]

    async def ping(self) -> bool:
        """Verify MongoDB connectivity."""
        try:
            await self._get_db().command("ping")
            return True
        except Exception:
            return False

    async def ensure_indexes(self) -> None:
        """Create indexes on evaluation and submission collections."""
        db = self._get_db()
        await db["eval_cases"].create_index("case_id", unique=True)
        await db["eval_cases"].create_index("category")
        await db["guidelines"].create_index("rule_id", unique=True)
        await db["claims"].create_index("claim_code", unique=True)
        await db["eval_runs"].create_index("created_at")

    async def upsert_eval_case(self, case: dict[str, Any]) -> None:
        """Insert or update a real evaluation/submission case in MongoDB."""
        db = self._get_db()
        doc = {**case, "updated_at": datetime.now(timezone.utc)}
        await db["eval_cases"].update_one(
            {"case_id": case["case_id"]},
            {"$set": doc, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
            upsert=True,
        )

    async def list_eval_cases(
        self, *, category: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        """Retrieve evaluation/submission cases from MongoDB."""
        db = self._get_db()
        query: dict[str, Any] = {}
        if category:
            query["category"] = category
        cursor = db["eval_cases"].find(query, {"_id": 0}).limit(limit)
        return await cursor.to_list(length=limit)

    async def upsert_guideline(self, rule: dict[str, Any]) -> None:
        db = self._get_db()
        await db["guidelines"].update_one(
            {"rule_id": rule["rule_id"]},
            {"$set": rule},
            upsert=True,
        )

    async def list_guidelines(self, limit: int = 200) -> list[dict[str, Any]]:
        db = self._get_db()
        return await db["guidelines"].find({}, {"_id": 0}).limit(limit).to_list(length=limit)

    async def upsert_claim(self, claim: dict[str, Any]) -> None:
        db = self._get_db()
        await db["claims"].update_one(
            {"claim_code": claim["claim_code"]},
            {"$set": claim},
            upsert=True,
        )

    async def list_claims(self, limit: int = 200) -> list[dict[str, Any]]:
        db = self._get_db()
        return await db["claims"].find({}, {"_id": 0}).limit(limit).to_list(length=limit)

    async def record_eval_run(self, run_summary: dict[str, Any]) -> None:
        """Persist an evaluation run summary to MongoDB."""
        db = self._get_db()
        await db["eval_runs"].insert_one(
            {**run_summary, "created_at": datetime.now(timezone.utc)}
        )

    async def list_eval_runs(self, limit: int = 20) -> list[dict[str, Any]]:
        db = self._get_db()
        cursor = db["eval_runs"].find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
        return await cursor.to_list(length=limit)

    async def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None

