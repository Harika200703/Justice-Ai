import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.models import LegalDocument, User
from app.security import get_current_user
from app.services.text_extractor import extract_text, SUPPORTED
from app.services.legal_analysis import analyze_document
from app.services.evidence import (
    sha256_file,
    register_hash_on_chain,
    verify_hash_on_chain,
)

router = APIRouter(prefix="/api/documents", tags=["documents"])


def serialise(document, include_report=False):
    result = {
        "id": document.id,
        "filename": document.filename,
        "sha256_hash": document.sha256_hash,
        "state": document.state,
        "status": document.status,
        "created_at": document.created_at.isoformat() + "Z",
        "blockchain_tx_hash": document.blockchain_tx_hash,
    }

    if include_report:
        result["report"] = json.loads(document.report_json)

    return result


def get_owned_document(document_id, user, db):
    """Return a document only if it belongs to the signed-in user."""
    document = (
        db.query(LegalDocument)
        .filter(
            LegalDocument.id == document_id,
            LegalDocument.owner_id == user.id,
        )
        .first()
    )

    if not document:
        raise HTTPException(404, "Document not found.")

    return document


@router.post("/analyze")
async def upload_analyse(
    file: UploadFile = File(...),
    state: str = Form("Not specified"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = Path(file.filename or "document").name
    ext = Path(name).suffix.lower()

    if ext not in SUPPORTED:
        raise HTTPException(415, "Upload PDF, DOCX, or TXT.")

    limit = settings.max_upload_mb * 1024 * 1024
    folder = Path(settings.upload_dir).resolve()
    folder.mkdir(parents=True, exist_ok=True)

    stored = folder / f"{uuid.uuid4().hex}{ext}"
    total = 0
    saved_to_database = False

    try:
        with stored.open("wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)

                if not chunk:
                    break

                total += len(chunk)

                if total > limit:
                    raise HTTPException(
                        413,
                        f"File exceeds {settings.max_upload_mb} MB.",
                    )

                output.write(chunk)

        if not total:
            raise HTTPException(400, "Uploaded file is empty.")

        try:
            text = extract_text(str(stored))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

        digest = sha256_file(str(stored))

        try:
            report = await analyze_document(name, state, text)
        except Exception as exc:
            # Diagnostic details go to the backend terminal, not the API response.
            print(
                f"AI ANALYSIS ERROR: {type(exc).__name__}: {exc}",
                flush=True,
            )

            raise HTTPException(
                502,
                f"Document AI analysis failed ({type(exc).__name__}). "
                "Check the backend terminal for diagnostic details.",
            ) from exc

        document = LegalDocument(
            owner_id=user.id,
            filename=name,
            stored_path=str(stored),
            sha256_hash=digest,
            state=state,
            extracted_text=text[:1000000],
            report_json=json.dumps(report, ensure_ascii=False),
            status="analysed",
        )

        db.add(document)
        db.commit()
        db.refresh(document)
        saved_to_database = True

        return {
            **serialise(document, True),
            "blockchain": {
                "registered": False,
                "reason": (
                    "The fingerprint is saved locally. "
                    "Register it using the evidence integrity controls."
                ),
            },
        }

    except Exception:
        if not saved_to_database and stored.exists():
            try:
                stored.unlink()
            except OSError:
                pass

        raise

    finally:
        await file.close()


@router.get("")
def list_documents(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    documents = (
        db.query(LegalDocument)
        .filter(LegalDocument.owner_id == user.id)
        .order_by(LegalDocument.created_at.desc())
        .limit(100)
        .all()
    )

    return [serialise(document) for document in documents]


@router.get("/{document_id}")
def get_document(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    document = get_owned_document(document_id, user, db)
    return serialise(document, True)


@router.delete("/{document_id}")
def delete_document(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    document = get_owned_document(document_id, user, db)
    stored_path = document.stored_path

    try:
        db.delete(document)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            500,
            "Could not delete the document. Please try again.",
        ) from exc

    file_deleted = False

    if stored_path:
        try:
            stored_file = Path(stored_path)

            if stored_file.is_file():
                stored_file.unlink()
                file_deleted = True
        except OSError:
            pass

    return {
        "message": "Document and analysis deleted successfully.",
        "document_id": document_id,
        "file_deleted": file_deleted,
    }


@router.post("/{document_id}/verify-integrity")
def verify_integrity(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    document = get_owned_document(document_id, user, db)

    stored_file = Path(document.stored_path)

    if not stored_file.is_file():
        raise HTTPException(404, "Stored file is missing.")

    current_hash = sha256_file(str(stored_file))
    local_matches = current_hash == document.sha256_hash

    blockchain = verify_hash_on_chain(document.sha256_hash)

    return {
        "document_id": document.id,
        "filename": document.filename,
        "local_sha256_matches": local_matches,
        "stored_sha256": document.sha256_hash,
        "current_sha256": current_hash,
        "blockchain": blockchain,
        "blockchain_tx_hash": (
            document.blockchain_tx_hash
            or blockchain.get("transaction_hash")
        ),
        "note": (
            "A matching fingerprint supports file-integrity checking. "
            "It does not prove truth, authorship, origin, or "
            "court admissibility."
        ),
    }


@router.post("/{document_id}/register-evidence")
def register_evidence(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    document = get_owned_document(document_id, user, db)

    stored_file = Path(document.stored_path)

    if not stored_file.is_file():
        raise HTTPException(404, "Stored file is missing.")

    current_hash = sha256_file(str(stored_file))

    if current_hash != document.sha256_hash:
        raise HTTPException(
            409,
            "Local file integrity check failed. Evidence was not registered.",
        )

    result = register_hash_on_chain(document.sha256_hash)

    transaction_hash = result.get("transaction_hash")

    if transaction_hash:
        document.blockchain_tx_hash = transaction_hash

        try:
            db.commit()
            db.refresh(document)
        except Exception as exc:
            db.rollback()
            raise HTTPException(
                500,
                "The blockchain result was returned, but the transaction "
                "details could not be saved to the database.",
            ) from exc

    return {
        **result,
        "document_id": document.id,
        "filename": document.filename,
        "sha256_hash": document.sha256_hash,
        "blockchain_tx_hash": document.blockchain_tx_hash,
    }
