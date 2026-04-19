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


def test_create_document_after_login(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'test_documents.db'}"
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
            "email": "pytest_docs@test.com",
            "password": "12345678",
        },
    )

    login_response = client.post(
        "/auth/login",
        json={
            "email": "pytest_docs@test.com",
            "password": "12345678",
        },
    )

    assert login_response.status_code == 200

    access_token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    create_response = client.post(
        "/documents",
        json={
            "title": "QA Test Document",
            "content": "This is a backend document test.",
        },
        headers=headers,
    )

    assert create_response.status_code in {200, 201}

    create_data = create_response.json()["document"]
    document_id = create_data["id"]

    assert document_id
    assert create_data["title"] == "QA Test Document"

    detail_response = client.get(f"/documents/{document_id}", headers=headers)

    assert detail_response.status_code == 200

    detail_data = detail_response.json()
    assert detail_data["id"] == document_id
    assert detail_data["title"] == "QA Test Document"
    assert detail_data["content"] == "This is a backend document test."

    app.dependency_overrides.clear()
