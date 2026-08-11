package com.eventbooking.common.error;

import java.util.Map;

public abstract class ApiException extends RuntimeException {
    private final ErrorCode errorCode;
    private final boolean retryable;
    private final Map<String, Object> details;

    protected ApiException(ErrorCode errorCode, String message) {
        this(errorCode, message, false, Map.of());
    }

    protected ApiException(ErrorCode errorCode, String message, boolean retryable) {
        this(errorCode, message, retryable, Map.of());
    }

    protected ApiException(ErrorCode errorCode, String message, boolean retryable, Map<String, Object> details) {
        super(message);
        this.errorCode = errorCode;
        this.retryable = retryable;
        this.details = details;
    }

    public ErrorCode getErrorCode() { return errorCode; }
    public boolean isRetryable() { return retryable; }
    public Map<String, Object> getDetails() { return details; }
}
