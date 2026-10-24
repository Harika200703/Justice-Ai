import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from web3 import Web3

from app.core.config import settings


def sha256_file(path):
    """Calculate the SHA-256 fingerprint of a file."""
    digest = hashlib.sha256()

    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)

    return digest.hexdigest()


def _contract():
    """Load the compiled contract and connect to the configured RPC."""
    project_root = Path(__file__).resolve().parents[3]

    artifact = (
        project_root
        / "blockchain"
        / "artifacts"
        / "contracts"
        / "JusticeEvidence.sol"
        / "JusticeEvidence.json"
    )

    if not artifact.exists():
        raise FileNotFoundError(
            "Contract artifact not found. Compile the Hardhat contract first."
        )

    abi = json.loads(
        artifact.read_text(encoding="utf-8")
    )["abi"]

    w3 = Web3(
        Web3.HTTPProvider(settings.blockchain_rpc_url)
    )

    if not w3.is_connected():
        raise ConnectionError(
            "Cannot connect to the configured blockchain RPC."
        )

    address = settings.evidence_contract_address

    if not address:
        raise ValueError(
            "Evidence contract address is not configured."
        )

    contract = w3.eth.contract(
        address=Web3.to_checksum_address(address),
        abi=abi,
    )

    return w3, contract


def _find_registration_transaction(w3, contract, document_hash):
    """
    Find the transaction that emitted EvidenceRegistered for this hash.

    The contract does not store transaction hashes directly, so this
    searches its event logs.
    """
    try:
        event_filter = contract.events.EvidenceRegistered().create_filter(
            from_block=0,
            argument_filters={"documentHash": document_hash},
        )

        entries = event_filter.get_all_entries()

        if entries:
            latest = entries[-1]
            return {
                "transaction_hash": latest["transactionHash"].hex(),
                "block_number": latest["blockNumber"],
            }

    except Exception:
        # Event-log lookup may be unsupported by some RPC providers.
        pass

    return {
        "transaction_hash": None,
        "block_number": None,
    }


def register_hash_on_chain(file_hash):
    """Register a SHA-256 document fingerprint on the blockchain."""
    if (
        not settings.evidence_contract_address
        or not settings.blockchain_private_key
    ):
        return {
            "registered": False,
            "already_registered": False,
            "reason": (
                "Blockchain is not configured. "
                "The local SHA-256 fingerprint remains saved."
            ),
        }

    try:
        w3, contract = _contract()

        document_hash = bytes.fromhex(file_hash)

        if len(document_hash) != 32:
            return {
                "registered": False,
                "already_registered": False,
                "reason": "Invalid SHA-256 fingerprint.",
            }

        # Check whether this fingerprint is already registered.
        if contract.functions.verifyEvidence(document_hash).call():
            details = _find_registration_transaction(
                w3,
                contract,
                document_hash,
            )

            registered_at = contract.functions.registeredAt(
                document_hash
            ).call()

            registered_by = contract.functions.registeredBy(
                document_hash
            ).call()

            return {
                "registered": False,
                "already_registered": True,
                "transaction_hash": details["transaction_hash"],
                "block_number": details["block_number"],
                "registered_at": registered_at,
                "registered_by": registered_by,
                "reason": (
                    "This fingerprint is already registered on-chain."
                ),
            }

        account = w3.eth.account.from_key(
            settings.blockchain_private_key
        )

        transaction = contract.functions.registerEvidence(
            document_hash
        ).build_transaction(
            {
                "from": account.address,
                "nonce": w3.eth.get_transaction_count(
                    account.address,
                    "pending",
                ),
                "chainId": w3.eth.chain_id,
                "gas": 250000,
                "gasPrice": w3.eth.gas_price,
            }
        )

        signed = account.sign_transaction(transaction)

        tx_hash = w3.eth.send_raw_transaction(
            signed.raw_transaction
        )

        receipt = w3.eth.wait_for_transaction_receipt(
            tx_hash,
            timeout=60,
        )

        if receipt.status != 1:
            return {
                "registered": False,
                "already_registered": False,
                "reason": "Blockchain transaction failed.",
            }

        registered_at = contract.functions.registeredAt(
            document_hash
        ).call()

        registered_by = contract.functions.registeredBy(
            document_hash
        ).call()

        return {
            "registered": True,
            "already_registered": False,
            "transaction_hash": receipt.transactionHash.hex(),
            "block_number": receipt.blockNumber,
            "registered_at": registered_at,
            "registered_by": registered_by,
        }

    except Exception as exc:
        return {
            "registered": False,
            "already_registered": False,
            "reason": (
                f"Blockchain unavailable: {type(exc).__name__}. "
                "The local SHA-256 fingerprint remains recorded."
            ),
        }


def verify_hash_on_chain(file_hash):
    """Verify a fingerprint and retrieve its on-chain metadata."""
    if not settings.evidence_contract_address:
        return {
            "checked": False,
            "matches": None,
            "reason": "Blockchain verification is not configured.",
        }

    try:
        w3, contract = _contract()

        document_hash = bytes.fromhex(file_hash)

        if len(document_hash) != 32:
            return {
                "checked": False,
                "matches": None,
                "reason": "Invalid SHA-256 fingerprint.",
            }

        matches = contract.functions.verifyEvidence(
            document_hash
        ).call()

        if not matches:
            return {
                "checked": True,
                "matches": False,
                "registered_at": None,
                "registered_at_utc": None,
                "registered_by": None,
                "transaction_hash": None,
                "block_number": None,
                "reason": "Hash not found on configured chain.",
            }

        registered_at = contract.functions.registeredAt(
            document_hash
        ).call()

        registered_by = contract.functions.registeredBy(
            document_hash
        ).call()

        transaction = _find_registration_transaction(
            w3,
            contract,
            document_hash,
        )

        timestamp_utc = (
            datetime.fromtimestamp(
                registered_at,
                tz=timezone.utc,
            ).isoformat()
            if registered_at
            else None
        )

        return {
            "checked": True,
            "matches": True,
            "registered_at": registered_at,
            "registered_at_utc": timestamp_utc,
            "registered_by": registered_by,
            "transaction_hash": transaction["transaction_hash"],
            "block_number": transaction["block_number"],
            "reason": "Hash found on configured chain.",
        }

    except Exception as exc:
        return {
            "checked": False,
            "matches": None,
            "reason": (
                f"Blockchain unavailable: {type(exc).__name__}."
            ),
        }