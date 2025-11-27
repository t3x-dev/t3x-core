"""
Error handling - Unified exceptions and error responses

Defines standard error codes and exception classes, aligned with CORE_API_SPEC.zh.md.
"""

from __future__ import annotations

from typing import Optional
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


# ============================================================================
# Error code definitions
# ============================================================================

class ErrorCode:
    """Standard error codes"""
    # 400 Bad Request
    INVALID_TURN_HASH = "INVALID_TURN_HASH"
    INVALID_COMMIT_HASH = "INVALID_COMMIT_HASH"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    MUST_HAVE_MISSING = "MUST_HAVE_MISSING"
    MUSTNT_HAVE_PRESENT = "MUSTNT_HAVE_PRESENT"
    EXTRACTOR_UNAVAILABLE = "EXTRACTOR_UNAVAILABLE"

    # 404 Not Found
    PARENT_NOT_FOUND = "PARENT_NOT_FOUND"
    PROJECT_NOT_FOUND = "PROJECT_NOT_FOUND"
    CONVERSATION_NOT_FOUND = "CONVERSATION_NOT_FOUND"
    TURN_NOT_FOUND = "TURN_NOT_FOUND"
    COMMIT_NOT_FOUND = "COMMIT_NOT_FOUND"
    DRAFT_NOT_FOUND = "DRAFT_NOT_FOUND"
    BRANCH_NOT_FOUND = "BRANCH_NOT_FOUND"

    # 409 Conflict
    HASH_CHAIN_BROKEN = "HASH_CHAIN_BROKEN"
    BRANCH_ALREADY_EXISTS = "BRANCH_ALREADY_EXISTS"
    CANNOT_DELETE_CURRENT_BRANCH = "CANNOT_DELETE_CURRENT_BRANCH"

    # 500 Internal Server Error
    INTERNAL_ERROR = "INTERNAL_ERROR"


# ============================================================================
# Custom exceptions
# ============================================================================

class ContextFlowError(Exception):
    """Base exception for ContextFlow"""
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: Optional[dict] = None
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(message)


class NotFoundError(ContextFlowError):
    """Resource not found"""
    def __init__(self, code: str, message: str, details: Optional[dict] = None):
        super().__init__(code, message, 404, details)


class ValidationError(ContextFlowError):
    """Validation failed"""
    def __init__(self, code: str, message: str, details: Optional[dict] = None):
        super().__init__(code, message, 400, details)


class ConflictError(ContextFlowError):
    """Resource conflict"""
    def __init__(self, code: str, message: str, details: Optional[dict] = None):
        super().__init__(code, message, 409, details)


# ============================================================================
# Convenience functions
# ============================================================================

def project_not_found(project_id: str) -> NotFoundError:
    return NotFoundError(
        ErrorCode.PROJECT_NOT_FOUND,
        f"Project not found: {project_id}",
        {"project_id": project_id}
    )


def conversation_not_found(conversation_id: str) -> NotFoundError:
    return NotFoundError(
        ErrorCode.CONVERSATION_NOT_FOUND,
        f"Conversation not found: {conversation_id}",
        {"conversation_id": conversation_id}
    )


def turn_not_found(turn_hash: str) -> NotFoundError:
    return NotFoundError(
        ErrorCode.TURN_NOT_FOUND,
        f"Turn not found: {turn_hash}",
        {"turn_hash": turn_hash}
    )


def commit_not_found(commit_hash: str) -> NotFoundError:
    return NotFoundError(
        ErrorCode.COMMIT_NOT_FOUND,
        f"Commit not found: {commit_hash}",
        {"commit_hash": commit_hash}
    )


def invalid_turn_hash(expected: str, actual: str) -> ValidationError:
    return ValidationError(
        ErrorCode.INVALID_TURN_HASH,
        "Turn hash does not match content",
        {"expected": expected, "actual": actual}
    )


def hash_chain_broken(turn_hash: str, parent_hash: str) -> ConflictError:
    return ConflictError(
        ErrorCode.HASH_CHAIN_BROKEN,
        "Hash chain is broken",
        {"turn_hash": turn_hash, "parent_hash": parent_hash}
    )


def branch_not_found(branch_name: str) -> NotFoundError:
    return NotFoundError(
        ErrorCode.BRANCH_NOT_FOUND,
        f"Branch not found: {branch_name}",
        {"branch": branch_name}
    )


def branch_already_exists(branch_name: str) -> ConflictError:
    return ConflictError(
        ErrorCode.BRANCH_ALREADY_EXISTS,
        f"Branch already exists: {branch_name}",
        {"branch": branch_name}
    )


def cannot_delete_current_branch(branch_name: str) -> ConflictError:
    return ConflictError(
        ErrorCode.CANNOT_DELETE_CURRENT_BRANCH,
        f"Cannot delete current branch: {branch_name}. Switch to another branch first.",
        {"branch": branch_name}
    )


def extractor_unavailable(language: str, extractor: str) -> ValidationError:
    return ValidationError(
        ErrorCode.EXTRACTOR_UNAVAILABLE,
        f"Extractor for language '{language}' is not available. Required: {extractor}",
        {"language": language, "extractor": extractor}
    )


# ============================================================================
# Exception handlers
# ============================================================================

async def contextflow_exception_handler(
    request: Request,
    exc: ContextFlowError
) -> JSONResponse:
    """Handle ContextFlowError exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details
            }
        }
    )


async def generic_exception_handler(
    request: Request,
    exc: Exception
) -> JSONResponse:
    """Handle uncaught exceptions"""
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "error": {
                "code": ErrorCode.INTERNAL_ERROR,
                "message": "Internal server error",
                "details": {"error": str(exc)}
            }
        }
    )


def setup_exception_handlers(app):
    """Register exception handlers"""
    app.add_exception_handler(ContextFlowError, contextflow_exception_handler)
    # Note: In production environments, you may not want to expose internal error details
    # app.add_exception_handler(Exception, generic_exception_handler)
