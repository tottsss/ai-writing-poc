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


def test_register_user(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'test_auth.db'}"
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
    response = client.post(
        "/auth/register",
        json={
            "name": "Test User",
            "email": "pytest_auth@test.com",
            "password": "12345678",
        },
    )

    app.dependency_overrides.clear()

    assert response.status_code in {200, 201}
    assert response.json()["email"] == "pytest_auth@test.com"
