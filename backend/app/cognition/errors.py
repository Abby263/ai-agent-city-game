class CognitionUnavailableError(RuntimeError):
    pass


class CognitionValidationError(RuntimeError):
    pass


def provider_failure(error: Exception, provider: str) -> CognitionUnavailableError:
    """Expose actionable errors without returning SDK URLs, credentials, or request bodies."""
    status = getattr(error, "status_code", None) or getattr(error, "code", None)
    cause = error.__cause__
    for _ in range(4):
        if status is not None or cause is None:
            break
        status = getattr(cause, "status_code", None) or getattr(cause, "code", None)
        cause = cause.__cause__
    if status == 429:
        message = f"{provider} quota or rate limit reached. Wait for the quota to reset before retrying."
    elif status in {400, 401, 403, 404}:
        message = f"{provider} rejected the request. Check the backend API key, model access, and request configuration."
    else:
        message = f"{provider} could not finish the AI request. Check the backend connection and retry."
    return CognitionUnavailableError(message)
