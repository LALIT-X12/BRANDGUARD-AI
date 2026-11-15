from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.circuit_breaker import CircuitBreaker, CircuitState
from app.database.base import Base
from app.dependencies import get_db
from app.main import app
from app.schemas.auth import RegisterRequest
from app.services.auth_service import register_user


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def _override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_liveness_and_security_headers(client: TestClient) -> None:
    resp = client.get("/health/live")
    assert resp.status_code == 200
    assert resp.json() == {"status": "alive"}
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert resp.headers["X-Frame-Options"] == "DENY"
    assert "X-Request-ID" in resp.headers


def test_circuit_breaker_opens_and_recovers() -> None:
    cb = CircuitBreaker("test", failure_threshold=2, recovery_timeout=0)
    assert cb.allow_request() is True
    cb.record_failure()
    assert cb.state == CircuitState.CLOSED
    cb.record_failure()
    assert cb.state == CircuitState.OPEN
    # recovery_timeout=0 allows immediate half-open probe
    assert cb.allow_request() is True
    assert cb.state == CircuitState.HALF_OPEN
    cb.record_success()
    assert cb.state == CircuitState.CLOSED


def test_tenant_isolation_and_sensitivity_access(client: TestClient, db_session: Session) -> None:
    # Create two tenants
    t1 = client.post("/api/v1/tenants", json={"name": "Acme", "slug": "acme"})
    assert t1.status_code == 201
    t2 = client.post("/api/v1/tenants", json={"name": "Beta", "slug": "beta"})
    assert t2.status_code == 201

    # Register creator in Acme and another creator in Beta
    r1 = client.post(
        "/api/v1/auth/register",
        json={
            "tenant_slug": "acme",
            "email": "alice@acme.com",
            "full_name": "Alice",
            "password": "StrongPassword123!",
            "roles": ["creator"],
        },
    )
    assert r1.status_code == 201

    r2 = client.post(
        "/api/v1/auth/register",
        json={
            "tenant_slug": "beta",
            "email": "bob@beta.com",
            "full_name": "Bob",
            "password": "StrongPassword123!",
            "roles": ["creator"],
        },
    )
    assert r2.status_code == 201

    login_alice = client.post(
        "/api/v1/auth/login",
        json={"tenant_slug": "acme", "email": "alice@acme.com", "password": "StrongPassword123!"},
    )
    assert login_alice.status_code == 200
    alice_token = login_alice.json()["access_token"]

    login_bob = client.post(
        "/api/v1/auth/login",
        json={"tenant_slug": "beta", "email": "bob@beta.com", "password": "StrongPassword123!"},
    )
    assert login_bob.status_code == 200
    bob_token = login_bob.json()["access_token"]

    # Alice submits confidential content in Acme
    sub_resp = client.post(
        "/api/v1/submissions/text",
        headers={"Authorization": f"Bearer {alice_token}"},
        json={
            "title": "Q4 Launch",
            "channel": "web",
            "audience": "enterprise",
            "intent": "product launch",
            "content_format": "text",
            "sensitivity_label": "confidential",
            "raw_text": "Contact alice@acme.com for confidential pricing.",
        },
    )
    assert sub_resp.status_code == 201
    sub_id = sub_resp.json()["id"]

    # Bob in Beta cannot access Alice's submission (tenant isolation)
    bob_get = client.get(
        f"/api/v1/submissions/{sub_id}",
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    assert bob_get.status_code == 404

    # Public self-registration cannot escalate to brand_admin or brand_manager
    esc_resp = client.post(
        "/api/v1/auth/register",
        json={
            "tenant_slug": "acme",
            "email": "attacker@acme.com",
            "full_name": "Attacker",
            "password": "StrongPassword123!",
            "roles": ["brand_admin"],
        },
    )
    assert esc_resp.status_code == 403

    # Create a brand_manager in Acme via admin-privileged service -> 403 on confidential submission
    register_user(
        db_session,
        RegisterRequest(
            tenant_slug="acme",
            email="mgr@acme.com",
            full_name="Manager",
            password="StrongPassword123!",
            roles=["brand_manager"],
        ),
        allow_elevated_roles=True,
    )
    mgr_token = client.post(
        "/api/v1/auth/login",
        json={"tenant_slug": "acme", "email": "mgr@acme.com", "password": "StrongPassword123!"},
    ).json()["access_token"]

    mgr_get = client.get(
        f"/api/v1/submissions/{sub_id}",
        headers={"Authorization": f"Bearer {mgr_token}"},
    )
    assert mgr_get.status_code == 403

