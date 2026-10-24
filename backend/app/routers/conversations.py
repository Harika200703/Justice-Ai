
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ChatConversation, ChatMessage, User
from app.security import get_current_user


router = APIRouter(
    prefix="/api/conversations",
    tags=["Chat History"],
)


class CreateConversationRequest(BaseModel):
    title: str = Field(default="New conversation", max_length=200)
    language: str = Field(default="English", max_length=30)
    jurisdiction: str = Field(default="India", max_length=100)


class UpdateConversationRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    language: str | None = Field(default=None, max_length=30)
    jurisdiction: str | None = Field(default=None, max_length=100)


class CreateMessageRequest(BaseModel):
    role: str
    content: str = Field(min_length=1, max_length=30000)
    sources: list[dict[str, str]] = Field(default_factory=list)
    disclaimer: str = ""


def get_owned_conversation(
    conversation_id: int,
    user_id: int,
    db: Session,
) -> ChatConversation:
    conversation = (
        db.query(ChatConversation)
        .filter(
            ChatConversation.id == conversation_id,
            ChatConversation.owner_id == user_id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found.",
        )

    return conversation


def serialize_message(message: ChatMessage) -> dict:
    try:
        sources = json.loads(message.sources_json or "[]")
        if not isinstance(sources, list):
            sources = []
    except (json.JSONDecodeError, TypeError):
        sources = []

    return {
        "id": message.id,
        "role": message.role,
        "content": message.content,
        "sources": sources,
        "disclaimer": message.disclaimer or "",
        "created_at": message.created_at.isoformat(),
    }


def serialize_conversation(
    conversation: ChatConversation,
    include_messages: bool = False,
) -> dict:
    result = {
        "id": conversation.id,
        "title": conversation.title,
        "language": conversation.language,
        "jurisdiction": conversation.jurisdiction,
        "created_at": conversation.created_at.isoformat(),
        "updated_at": conversation.updated_at.isoformat(),
        "message_count": len(conversation.messages),
    }

    if include_messages:
        result["messages"] = [
            serialize_message(message)
            for message in conversation.messages
        ]

    return result


@router.post("", status_code=status.HTTP_201_CREATED)
def create_conversation(
    payload: CreateConversationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = ChatConversation(
        owner_id=current_user.id,
        title=payload.title.strip() or "New conversation",
        language=payload.language.strip() or "English",
        jurisdiction=payload.jurisdiction.strip() or "India",
    )

    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    return serialize_conversation(conversation)


@router.get("")
def list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversations = (
        db.query(ChatConversation)
        .filter(ChatConversation.owner_id == current_user.id)
        .order_by(ChatConversation.updated_at.desc())
        .all()
    )

    return {
        "conversations": [
            serialize_conversation(conversation)
            for conversation in conversations
        ]
    }


@router.get("/{conversation_id}")
def get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = get_owned_conversation(
        conversation_id,
        current_user.id,
        db,
    )

    return serialize_conversation(conversation, include_messages=True)


@router.patch("/{conversation_id}")
def update_conversation(
    conversation_id: int,
    payload: UpdateConversationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = get_owned_conversation(
        conversation_id,
        current_user.id,
        db,
    )

    changes = payload.model_dump(exclude_unset=True)

    for field, value in changes.items():
        if value is not None:
            value = value.strip()
            if value:
                setattr(conversation, field, value)

    conversation.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(conversation)

    return serialize_conversation(conversation)


@router.post("/{conversation_id}/messages", status_code=201)
def add_message(
    conversation_id: int,
    payload: CreateMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = get_owned_conversation(
        conversation_id,
        current_user.id,
        db,
    )

    role = payload.role.strip().lower()

    if role not in {"user", "assistant"}:
        raise HTTPException(
            status_code=422,
            detail="Role must be 'user' or 'assistant'.",
        )

    message = ChatMessage(
        conversation_id=conversation.id,
        role=role,
        content=payload.content,
        sources_json=json.dumps(payload.sources, ensure_ascii=False),
        disclaimer=payload.disclaimer,
    )

    db.add(message)

    # Use the first user question as the conversation title.
    if role == "user" and conversation.title == "New conversation":
        conversation.title = payload.content.strip().splitlines()[0][:200]

    conversation.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(message)

    return serialize_message(message)


@router.delete("/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = get_owned_conversation(
        conversation_id,
        current_user.id,
        db,
    )

    db.delete(conversation)
    db.commit()

    return None
