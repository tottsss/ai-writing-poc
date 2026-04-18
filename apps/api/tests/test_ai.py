from pathlib import Path
import sys
import types

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

if "jose" not in sys.modules:
    jose_module = types.ModuleType("jose")
    jose_module.JWTError = Exception
    jose_module.jwt = types.SimpleNamespace(
        encode=lambda *args, **kwargs: "test-token",
        decode=lambda *args, **kwargs: {"sub": "1", "type": "access"},
    )
    sys.modules["jose"] = jose_module

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


def test_summarize_document_content(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'test_ai.db'}"
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
            "name": "Test User",
            "email": "pytest_ai@test.com",
            "password": "12345678",
        },
    )

    login_response = client.post(
        "/auth/login",
        json={
            "email": "pytest_ai@test.com",
            "password": "12345678",
        },
    )

    assert login_response.status_code == 200

    access_token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    create_response = client.post(
        "/documents",
        json={
            "title": "AI Test Document",
            "content": "This is a document used for AI testing.",
        },
        headers=headers,
    )

    assert create_response.status_code in {200, 201}

    document_id = create_response.json()["document"]["id"]

    summarize_response = client.post(
        f"/documents/{document_id}/ai/summarize",
        json={"text": "This is a document used for AI testing."},
        headers=headers,
    )

    app.dependency_overrides.clear()

    assert summarize_response.status_code == 200
    assert summarize_response.text
    assert summarize_response.text.strip() != ""
