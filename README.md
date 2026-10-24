# Justice AI
Windows-friendly full-stack starter for Indian legal-document research.

## Included
- Responsive login page with your original logo copied unchanged and navy/saffron/ivory palette.
- FastAPI + SQLite backend, secure password hashing, JWT authentication.
- PDF/DOCX/TXT extraction and document upload.
- Configurable hosted OpenAI-compatible API for structured legal research.
- Source-discovery links for official Indian legal sources; state/UT selection.
- SHA-256 integrity checks and optional Solidity/Hardhat evidence registry.
- Clearly labelled demo mode if no AI API key/model is configured.

## Run on Windows
Install Python 3.11+ and VS Code. Node.js is only needed for optional blockchain.

PowerShell terminal:
```powershell
cd "justice ai\backend"
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```
Edit `backend/.env`: set a long random `JWT_SECRET`. Add your AI provider's API key and model if you want real model-assisted analysis. Never share or commit `.env`.

Start backend from `backend`:
```powershell
uvicorn app.main:app --reload
```
Check http://127.0.0.1:8000/docs

In a second terminal from project root:
```powershell
cd frontend
py -m http.server 5500
```
Open http://127.0.0.1:5500/login.html. Use **Create an account** first.

## Hosted AI API
Configure `AI_API_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` in `backend/.env`. This project expects an OpenAI-compatible `/chat/completions` endpoint with JSON response-format support. Provider pricing/rate limits apply. Without configuration, the app clearly returns demo mode, not fabricated legal analysis.

## Optional Hardhat
```powershell
cd blockchain
npm install
npx hardhat compile
npx hardhat node
```
In another terminal:
```powershell
cd blockchain
npx hardhat run scripts/deploy.js --network localhost
```
Set `EVIDENCE_CONTRACT_ADDRESS`, `BLOCKCHAIN_RPC_URL`, and a local test-only `BLOCKCHAIN_PRIVATE_KEY` in `backend/.env`. Local chain state resets when the node restarts.

## API
`GET /api/health`; `POST /api/auth/register`; `POST /api/auth/login`; `GET /api/auth/me`; `POST /api/documents/analyze`; `GET /api/documents`; `GET /api/documents/{id}`; `POST /api/documents/{id}/verify-integrity`; `POST /api/documents/{id}/register-evidence`.

## Legal and security limitations
This is a starter, not a production legal service. AI can be wrong or outdated. Verify every law, section, amendment, commencement date, punishment, and citation with official sources or a qualified lawyer. Source links are discovery starting points, not proof that a provision applies. No legal corpus is bundled; this starter does not perform full authoritative-source retrieval. State-specific law must be independently verified. Scanned PDFs need OCR (not included). Do not upload sensitive documents unless you understand your AI provider's data handling. Before deployment add HTTPS, rate limits, retention/deletion controls, audit logging, malware scanning, backups, secure secrets management, and a curated/versioned legal source index.
