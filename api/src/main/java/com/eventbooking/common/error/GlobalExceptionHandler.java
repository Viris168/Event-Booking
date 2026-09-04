package com.eventbooking.common.error;

import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.context.request.WebRequest;

import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private final ApiProblemFactory problemFactory;
    private final DatabaseExceptionTranslator dbTranslator;

    public GlobalExceptionHandler(ApiProblemFactory problemFactory, DatabaseExceptionTranslator dbTranslator) {
        this.problemFactory = problemFactory;
        this.dbTranslator = dbTranslator;
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ProblemDetail> handleApiException(ApiException ex, WebRequest request) {
        ProblemDetail problem = problemFactory.createProblemDetail(
                ex.getErrorCode(), ex.getMessage(), ex.isRetryable(), ex.getDetails());

        if (ex.getErrorCode() == ErrorCode.INTERNAL_SERVER_ERROR) {
            log.error("Internal domain error: ", ex);
        } else {
            log.warn("Domain exception: {} - {}", ex.getErrorCode(), ex.getMessage());
        }

        return createResponse(problem);
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ProblemDetail> handleDataAccessException(DataAccessException ex, WebRequest request) {
        RuntimeException translated = dbTranslator.translate(ex);

        if (translated instanceof ApiException apiEx) {
            return handleApiException(apiEx, request);
        }

        log.error("Unhandled Database Exception: ", ex);
        ProblemDetail problem = problemFactory.createProblemDetail(
                ErrorCode.INTERNAL_SERVER_ERROR, "An unexpected database error occurred.", false, null);
        return createResponse(problem);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetail> handleValidationExceptions(MethodArgumentNotValidException ex) {
        Map<String, Object> errors = new HashMap<>();
        ex.getBindingResult().getAllErrors().forEach(error -> {
            String fieldName = error instanceof FieldError fe ? fe.getField() : error.getObjectName();
            errors.put(fieldName, error.getDefaultMessage());
        });

        ProblemDetail problem = problemFactory.createProblemDetail(
                ErrorCode.VALIDATION_ERROR, "Request validation failed.", false, errors);
        return createResponse(problem);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ProblemDetail> handleJakartaConstraintViolation(ConstraintViolationException ex) {
        ProblemDetail problem = problemFactory.createProblemDetail(
                ErrorCode.VALIDATION_ERROR, ex.getMessage(), false, null);
        return createResponse(problem);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ProblemDetail> handleHttpMessageNotReadable(HttpMessageNotReadableException ex) {
        ProblemDetail problem = problemFactory.createProblemDetail(
                ErrorCode.MALFORMED_REQUEST, "Malformed JSON request body.", false, null);
        return createResponse(problem);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ProblemDetail> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        ProblemDetail problem = problemFactory.createProblemDetail(
                ErrorCode.MALFORMED_REQUEST, "Invalid path or query parameter format.", false, null);
        return createResponse(problem);
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<ProblemDetail> handleMissingRequestHeader(MissingRequestHeaderException ex) {
        ProblemDetail problem = problemFactory.createProblemDetail(
                ErrorCode.MALFORMED_REQUEST, "Missing required request header: " + ex.getHeaderName() + ".", false, null);
        return createResponse(problem);
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ProblemDetail> handleMediaTypeNotSupported(HttpMediaTypeNotSupportedException ex) {
        // Chiefly the image endpoints, which are the only ones that declare a
        // consumes type: a client that posts JSON to them has sent a request
        // the route cannot read, which is a 415 and not the 500 this fell
        // through to before.
        ProblemDetail problem = problemFactory.createProblemDetail(
                ErrorCode.UNSUPPORTED_MEDIA_TYPE,
                "Content-Type '" + ex.getContentType() + "' is not supported by this endpoint.", false, null);
        return createResponse(problem);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ProblemDetail> handleMaxUploadSizeExceeded(MaxUploadSizeExceededException ex) {
        // Tomcat's spring.servlet.multipart ceiling, tripped before any
        // controller runs. FileUploadUtil handles anything that gets past it;
        // without this the client would see a bare 500 for an oversized file.
        ProblemDetail problem = problemFactory.createProblemDetail(
                ErrorCode.FILE_TOO_LARGE, "Uploaded file exceeds the maximum allowed size.", false, null);
        return createResponse(problem);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ProblemDetail> handleNoResourceFound(NoResourceFoundException ex) {
        ProblemDetail problem = problemFactory.createProblemDetail(
                ErrorCode.RESOURCE_NOT_FOUND, "No API route or static resource exists for this request.", false, null);
        return createResponse(problem);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handleAllUncaughtException(Exception ex, WebRequest request) {
        log.error("Unknown Server Error: ", ex);
        ProblemDetail problem = problemFactory.createProblemDetail(
                ErrorCode.INTERNAL_SERVER_ERROR, "An unexpected internal server error occurred.", false, null);
        return createResponse(problem);
    }

    private ResponseEntity<ProblemDetail> createResponse(ProblemDetail problem) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Content-Type", "application/problem+json");

        if (problem.getStatus() == 503) {
            headers.set("Retry-After", "2");
        }

        return new ResponseEntity<>(problem, headers, problem.getStatus());
    }
}
