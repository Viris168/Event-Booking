package com.ticketing.api.exception;

import com.ticketing.api.dto.VerificationDtos.ApiError;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiError> handleApiException(ApiException ex) {
        return ResponseEntity.status(ex.getStatus()).body(ex.getBody());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiError> handleBadToken(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(ApiError.of(
                ex.getMessage() != null ? ex.getMessage() : "INVALID_REQUEST"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception ex) {
        return ResponseEntity.internalServerError().body(ApiError.of("INTERNAL_ERROR"));
    }
}
