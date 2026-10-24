from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.models import User


pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

# Swagger will use a standard Bearer token instead of an OAuth2
# password form, which matches the existing JSON login endpoint.
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password):
    return pwd_context.hash(password)


def verify_password(password, hashed):
    return pwd_context.verify(password, hashed)


def create_access_token(user_id):
    expires = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )

    return jwt.encode(
        {
            "sub": str(user_id),
            "exp": expires
        },
        settings.jwt_secret,
        algorithm="HS256"
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db)
):
    unauthorized = HTTPException(
        status_code=401,
        detail="Invalid or expired login. Please sign in again.",
        headers={"WWW-Authenticate": "Bearer"}
    )

    if credentials is None:
        raise unauthorized

    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"]
        )

        user_id = int(payload.get("sub", ""))

    except (JWTError, ValueError, TypeError):
        raise unauthorized

    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise unauthorized

    return user