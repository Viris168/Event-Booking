package com.eventbooking.common.error;

import org.slf4j.MDC;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.Instant;
import java.util.UUID;
import java.util.Map;

@Component
public class ApiProblemFactory {

    public ProblemDetail createProblemDetail(ErrorCode errorCode, String detailMessage, boolean retryable, Map<String, Object> additionalDetails) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(errorCode.getStatus(), detailMessage);
        
        problemDetail.setTitle(errorCode.name().replace("_", " "));
        problemDetail.setType(URI.create("https://api.yourdomain.com/errors/" + errorCode.name().toLowerCase()));
        
        problemDetail.setProperty("errorCode", errorCode.name());
        problemDetail.setProperty("retryable", retryable);
        problemDetail.setProperty("timestamp", Instant.now());
        
        String traceId = MDC.get("traceId");
        if (traceId == null || traceId.isBlank()) {
            traceId = UUID.randomUUID().toString(); // Fallback if tracer is unconfigured
        }
        problemDetail.setProperty("traceId", traceId);
        
        if (additionalDetails != null && !additionalDetails.isEmpty()) {
            problemDetail.setProperty("details", additionalDetails);
        }
        
        return problemDetail;
    }
}