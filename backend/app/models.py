
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    Text,
)
from sqlalchemy.orm import relationship

from app.db import Base


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(254), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    documents = relationship(
        "LegalDocument",
        back_populates="owner",
        cascade="all, delete-orphan",
    )

    conversations = relationship(
        "ChatConversation",
        back_populates="owner",
        cascade="all, delete-orphan",
    )


class LegalDocument(Base):
    __tablename__ = "legal_documents"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    stored_path = Column(String(500), nullable=False)
    sha256_hash = Column(String(64), nullable=False, index=True)
    state = Column(String(100), default="Not specified", nullable=False)
    extracted_text = Column(Text, nullable=False)
    report_json = Column(Text, nullable=False)
    status = Column(String(30), default="analysed", nullable=False)
    blockchain_tx_hash = Column(String(100))
    created_at = Column(DateTime, default=utcnow, nullable=False)

    owner = relationship("User", back_populates="documents")


class ChatConversation(Base):
    __tablename__ = "chat_conversations"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    title = Column(String(200), default="New conversation", nullable=False)
    language = Column(String(30), default="English", nullable=False)
    jurisdiction = Column(String(100), default="India", nullable=False)

    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, nullable=False)

    owner = relationship("User", back_populates="conversations")

    messages = relationship(
        "ChatMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)

    conversation_id = Column(
        Integer,
        ForeignKey("chat_conversations.id"),
        nullable=False,
        index=True,
    )

    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)

    # Store source links as JSON text.
    sources_json = Column(Text, nullable=False, default="[]")
    disclaimer = Column(Text, nullable=False, default="")

    created_at = Column(DateTime, default=utcnow, nullable=False)

    conversation = relationship(
        "ChatConversation",
        back_populates="messages",
    )

class CaseRecord(Base):
    __tablename__ = "case_records"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True
    )
    title = Column(String(200), nullable=False)
    case_type = Column(String(80), default="General", nullable=False)
    description = Column(Text, default="", nullable=False)
    status = Column(String(30), default="Open", nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=utcnow,
        onupdate=utcnow,
        nullable=False
    )
