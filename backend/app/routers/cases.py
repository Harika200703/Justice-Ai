
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import CaseRecord, User
from app.security import get_current_user


router = APIRouter(
    prefix="/api/cases",
    tags=["Case Management"],
)


class CaseCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    case_type: str = Field(default="General", max_length=80)
    description: str = Field(default="", max_length=10000)


class CaseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    case_type: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=10000)
    status: Literal["Open", "In Progress", "Closed"] | None = None


def serialize_case(case: CaseRecord) -> dict:
    return {
        "id": case.id,
        "case_id": f"CASE-{case.id:06d}",
        "title": case.title,
        "case_type": case.case_type,
        "description": case.description,
        "status": case.status,
        "created_at": case.created_at.isoformat() + "Z",
        "updated_at": case.updated_at.isoformat() + "Z",
    }


def get_owned_case(
    case_id: int,
    user: User,
    db: Session,
) -> CaseRecord:
    case = (
        db.query(CaseRecord)
        .filter(
            CaseRecord.id == case_id,
            CaseRecord.owner_id == user.id,
        )
        .first()
    )

    if case is None:
        raise HTTPException(status_code=404, detail="Case not found.")

    return case


@router.get("")
def list_cases(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cases = (
        db.query(CaseRecord)
        .filter(CaseRecord.owner_id == user.id)
        .order_by(CaseRecord.created_at.desc(), CaseRecord.id.desc())
        .all()
    )

    return {
        "total": len(cases),
        "cases": [serialize_case(case) for case in cases],
    }


@router.post("", status_code=201)
def create_case(
    payload: CaseCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    title = payload.title.strip()

    if not title:
        raise HTTPException(status_code=422, detail="Case title is required.")

    case = CaseRecord(
        owner_id=user.id,
        title=title,
        case_type=payload.case_type.strip() or "General",
        description=payload.description.strip(),
        status="Open",
    )

    db.add(case)
    db.commit()
    db.refresh(case)

    return serialize_case(case)


@router.get("/{case_id}")
def get_case(
    case_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return serialize_case(get_owned_case(case_id, user, db))


@router.patch("/{case_id}")
def update_case(
    case_id: int,
    payload: CaseUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = get_owned_case(case_id, user, db)
    changes = payload.model_dump(exclude_unset=True)

    for field, value in changes.items():
        if isinstance(value, str):
            value = value.strip()

        if field == "title" and not value:
            raise HTTPException(
                status_code=422,
                detail="Case title cannot be empty.",
            )

        if field == "case_type" and not value:
            value = "General"

        setattr(case, field, value)

    db.commit()
    db.refresh(case)

    return serialize_case(case)


@router.delete("/{case_id}")
def delete_case(
    case_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    case = get_owned_case(case_id, user, db)

    db.delete(case)
    db.commit()

    return {
        "message": "Case deleted successfully.",
        "case_id": f"CASE-{case.id:06d}",
    }
