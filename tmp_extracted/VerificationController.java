package com.ticketing.api.controller;

import com.ticketing.api.dto.VerificationDtos.*;
import com.ticketing.api.security.EventStaffInterceptor;
import com.ticketing.api.service.VerificationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/events/{eventId}/verify")
public class VerificationController {

    private final VerificationService verificationService;

    public VerificationController(VerificationService verificationService) {
        this.verificationService = verificationService;
    }

    // eventId in the path is validated + staff-checked by EventStaffInterceptor
    // before any of these methods run; we just read it back off the request.
    private UUID currentScannerId() {
        return (UUID) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }

    @PostMapping("/individual")
    public IndividualResult verifyIndividual(
            @PathVariable UUID eventId,
            @Valid @RequestBody QrTokenRequest body) {
        return verificationService.verifyIndividual(eventId, currentScannerId(), body.qrToken());
    }

    @PostMapping("/group/preview")
    public GroupPreviewResult previewGroup(
            @PathVariable UUID eventId,
            @Valid @RequestBody QrTokenRequest body) {
        return verificationService.previewGroup(eventId, body.qrToken());
    }

    @PostMapping("/group/confirm")
    public GroupConfirmResult confirmGroup(
            @PathVariable UUID eventId,
            @Valid @RequestBody GroupConfirmRequest body) {
        return verificationService.confirmGroup(
                eventId, currentScannerId(), UUID.fromString(body.orderId()), body.admit());
    }
}
