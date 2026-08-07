"""鉴权与权限工具。"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_PREFIX}/auth/login")

Role = str  # admin / leader / consultant / operator


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, role: str, expires_minutes: Optional[int] = None) -> str:
    expire = datetime.utcnow() + timedelta(minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": subject, "role": role, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    creds_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise creds_error
    except JWTError:
        raise creds_error
    user = db.get(User, uuid.UUID(user_id))
    if user is None or user.status != "active":
        raise creds_error
    return user


def require_roles(*roles: Role):
    """角色守卫：admin 始终通过。"""

    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role == "admin":
            return user
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")
        return user

    return _dep


def can_view_full_contact(user: User) -> bool:
    """是否能查看完整（非脱敏）联系方式：admin / leader / consultant 可看，operator 不可。"""
    return user.role in {"admin", "leader", "consultant"}


def can_export(user: User) -> bool:
    return user.role in {"admin", "leader"}
