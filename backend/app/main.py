from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db import Base, engine
from app import models
from app.routers import auth, documents, chat, conversations, cases
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=(
        "Indian legal document research and evidence integrity starter."
    ),
    lifespan=lifespan,
)


# Allow the frontend to communicate with the backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ],
    allow_credentials=False,
    allow_methods=[
        "GET",
        "POST",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=[
        "Authorization",
        "Content-Type",
    ],
)


app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(conversations.router)
app.include_router(cases.router)

@app.get("/")
def root():
    return {
        "app": settings.app_name,
        "status": "running",
        "docs": "/docs",
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "ai_configured": bool(
            settings.ai_api_key and settings.ai_model
        ),
    }