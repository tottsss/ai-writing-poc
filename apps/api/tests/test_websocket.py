from pathlib import Path
import sys
import types

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(str(Path(__file__).resolve().parents[1]))

if "jose" not in sys.modules:
    def _encode(payload, *args, **kwargs):
        return f"{payload['sub']}::{payload['type']}"

    def _decode(token, *args, **kwargs):
        subject, token_type = token.split("::", 1)
        return {"sub": subject, "type": token_type}

    jose_module = types.ModuleType("jose")
    jose_module.JWTError = Exception
    jose_module.jwt = types.SimpleNamespace(
        encode=_encode,
        decode=_decode,
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


def test_websocket_receives_initial_document_state(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'test_websocket.db'}"
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
            "name": "WebSocket User",
            "email": "pytest_ws@test.com",
            "password": "12345678",
        },
    )

    login_response = client.post(
        "/auth/login",
        json={
            "email": "pytest_ws@test.com",
            "password": "12345678",
        },
    )

    assert login_response.status_code == 200

    access_token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    create_response = client.post(
        "/documents",
        json={
            "title": "WebSocket Test Document",
            "content": "This is the current document state.",
        },
        headers=headers,
    )

    assert create_response.status_code in {200, 201}

    document_id = create_response.json()["document"]["id"]

    with client.websocket_connect(
        f"/ws/documents/{document_id}?token={access_token}"
    ) as websocket:
        first_message = websocket.receive_json()

    app.dependency_overrides.clear()

    assert first_message["type"] == "document_updated"
    assert first_message["payload"]["content"] == "This is the current document state."
    assert first_message["payload"]["version"] == 1
