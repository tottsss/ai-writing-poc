from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import User
from app.security import (
    REFRESH_TOKEN_TYPE,
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


def register_user(db: Session, *, email: str, password: str, name: str) -> User:
    user = User(email=email.lower(), password_hash=hash_password(password), name=name)
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Email already registered"
        ) from exc
    db.refresh(user)
    return user


def authenticate_user(db: Session, *, email: str, password: str) -> User:
    user = db.query(User).filter(User.email == email.lower()).first()
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return user


def issue_token_pair(user: User) -> tuple[str, str]:
    return create_access_token(user.id), create_refresh_token(user.id)


def refresh_access_token(db: Session, *, refresh_token: str) -> str:
    try:
        payload = decode_token(refresh_token, expected_type=REFRESH_TOKEN_TYPE)
    except TokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    user_id = int(payload["sub"])
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    return create_access_token(user.id)
