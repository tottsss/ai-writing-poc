from pathlib import Path
import sys
import types

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

if "passlib.context" not in sys.modules:
    passlib_module = types.ModuleType("passlib")
    passlib_context_module = types.ModuleType("passlib.context")

    class CryptContext:
        def __init__(self, *args, **kwargs):
            pass

        def hash(self, password: str) -> str:
            return f"hashed::{password}"

        def verify(self, password: str, hashed: str) -> bool:
            return hashed == f"hashed::{password}"

    passlib_context_module.CryptContext = CryptContext
    sys.modules["passlib"] = passlib_module
    sys.modules["passlib.context"] = passlib_context_module

from app.db import Base, get_db
from app.main import app
from app.routes import auth
import app.security as security


def _encode(payload, *args, **kwargs):
    return f"{payload['sub']}::{payload['type']}"


def _decode(token, *args, **kwargs):
    subject, token_type = token.split("::", 1)
    return {"sub": subject, "type": token_type}


security.jwt.encode = _encode
security.jwt.decode = _decode


def test_user_is_denied_access_before_document_is_shared(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'test_permissions.db'}"
    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    if not any(route.path == "/auth/register" for route in app.routes):
        app.include_router(auth.router, prefix="/auth")

    app.dependency_overrides[get_db] = override_get_db

    client = TestClient(app)

    client.post(
        "/auth/register",
        json={
            "name": "Owner User",
            "email": "pytest_owner@test.com",
            "password": "12345678",
        },
    )

    owner_login_response = client.post(
        "/auth/login",
        json={
            "email": "pytest_owner@test.com",
            "password": "12345678",
        },
    )

    assert owner_login_response.status_code == 200

    owner_headers = {
        "Authorization": f"Bearer {owner_login_response.json()['access_token']}"
    }

    create_response = client.post(
        "/documents",
        json={
            "title": "Permissions Test Document",
            "content": "This document belongs to the owner.",
        },
        headers=owner_headers,
    )

    assert create_response.status_code in {200, 201}

    document_id = create_response.json()["document"]["id"]

    client.post(
        "/auth/register",
        json={
            "name": "Other User",
            "email": "pytest_other@test.com",
            "password": "12345678",
        },
    )

    other_login_response = client.post(
        "/auth/login",
        json={
            "email": "pytest_other@test.com",
            "password": "12345678",
        },
    )

    assert other_login_response.status_code == 200

    other_headers = {
        "Authorization": f"Bearer {other_login_response.json()['access_token']}"
    }

    access_response = client.get(f"/documents/{document_id}", headers=other_headers)

    app.dependency_overrides.clear()

    assert access_response.status_code == 403
    assert access_response.json()["detail"] == "No access to this document"