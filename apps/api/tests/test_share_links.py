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


def _setup_client(tmp_path, db_name):
    database_url = f"sqlite:///{tmp_path / db_name}"
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
    return TestClient(app)


def _register_and_login(client, email, name="User"):
    client.post(
        "/auth/register",
        json={"name": name, "email": email, "password": "12345678"},
    )
    resp = client.post(
        "/auth/login",
        json={"email": email, "password": "12345678"},
    )
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_share_link_create_accept_edit_and_revoke(tmp_path):
    client = _setup_client(tmp_path, "test_share_links.db")
    try:
        owner_headers = _register_and_login(client, "owner_sl@test.com", "Owner")
        other_headers = _register_and_login(client, "other_sl@test.com", "Other")

        create_doc = client.post(
            "/documents",
            json={"title": "Shared Doc", "content": "<p>hi</p>"},
            headers=owner_headers,
        )
        assert create_doc.status_code in {200, 201}
        document_id = create_doc.json()["document"]["id"]

        link_resp = client.post(
            f"/documents/{document_id}/share-links",
            json={"role": "editor", "expires_in_hours": 24},
            headers=owner_headers,
        )
        assert link_resp.status_code == 201
        token = link_resp.json()["token"]
        assert len(token) >= 16

        # Second user cannot access before accepting.
        pre_access = client.get(f"/documents/{document_id}", headers=other_headers)
        assert pre_access.status_code == 403

        accept = client.post(
            f"/share-links/{token}/accept",
            headers=other_headers,
        )
        assert accept.status_code == 200
        assert accept.json()["role"] == "editor"
        assert str(accept.json()["document_id"]) == str(document_id)

        # Now second user can read and write as editor.
        read_after = client.get(f"/documents/{document_id}", headers=other_headers)
        assert read_after.status_code == 200
        current_version = read_after.json()["version"]

        put_resp = client.put(
            f"/documents/{document_id}",
            json={"content": "<p>updated by invitee</p>", "version": current_version},
            headers=other_headers,
        )
        assert put_resp.status_code == 200

        # Owner lists links — expect one non-revoked entry.
        listed = client.get(
            f"/documents/{document_id}/share-links", headers=owner_headers
        )
        assert listed.status_code == 200
        assert len(listed.json()) == 1
        assert listed.json()[0]["revoked"] is False

        # Owner revokes.
        revoke = client.delete(
            f"/documents/{document_id}/share-links/{token}",
            headers=owner_headers,
        )
        assert revoke.status_code == 200
        assert revoke.json()["revoked"] is True

        # Third user who has never accepted cannot use the revoked token.
        third_headers = _register_and_login(client, "third_sl@test.com", "Third")
        reject = client.post(
            f"/share-links/{token}/accept",
            headers=third_headers,
        )
        assert reject.status_code == 410
    finally:
        app.dependency_overrides.clear()


def test_share_link_owner_only_can_create(tmp_path):
    client = _setup_client(tmp_path, "test_share_links_owner_only.db")
    try:
        owner_headers = _register_and_login(client, "owner_only@test.com", "Owner")
        viewer_headers = _register_and_login(client, "viewer_only@test.com", "Viewer")

        create_doc = client.post(
            "/documents",
            json={"title": "Doc", "content": "<p>x</p>"},
            headers=owner_headers,
        )
        document_id = create_doc.json()["document"]["id"]

        # Share as viewer via email first so viewer has some role.
        share_email = client.post(
            f"/documents/{document_id}/share",
            json={"email": "viewer_only@test.com", "role": "viewer"},
            headers=owner_headers,
        )
        assert share_email.status_code == 201

        # Viewer cannot create share links.
        forbidden = client.post(
            f"/documents/{document_id}/share-links",
            json={"role": "viewer"},
            headers=viewer_headers,
        )
        assert forbidden.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_share_link_rejects_owner_role(tmp_path):
    client = _setup_client(tmp_path, "test_share_links_no_owner.db")
    try:
        owner_headers = _register_and_login(client, "owner_no_transfer@test.com", "Owner")
        create_doc = client.post(
            "/documents",
            json={"title": "Doc", "content": "<p>x</p>"},
            headers=owner_headers,
        )
        document_id = create_doc.json()["document"]["id"]

        bad = client.post(
            f"/documents/{document_id}/share-links",
            json={"role": "owner"},
            headers=owner_headers,
        )
        assert bad.status_code == 400
    finally:
        app.dependency_overrides.clear()
