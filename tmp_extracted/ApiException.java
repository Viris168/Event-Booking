package com.ticketing.api.exception;

import com.ticketing.api.dto.VerificationDtos.ApiError;
import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final ApiError body;

    public ApiException(HttpStatus status, ApiError body) {
        super(body.error());
        this.status = status;
        this.body = body;
    }

    public HttpStatus getStatus() { return status; }
    public ApiError getBody() { return body; }
}
