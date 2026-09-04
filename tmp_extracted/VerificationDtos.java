package com.ticketing.api.dto;

import jakarta.validation.constraints.NotBlank;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public class VerificationDtos {

    public record QrTokenRequest(@NotBlank String qrToken) {}

    public record GroupConfirmRequest(
            @NotBlank String orderId,
            @NotBlank String admit // "ALL" or a positive integer as string, validated in service
    ) {}

    public record IndividualResult(int admitted, UUID ticketId, UUID orderId) {}

    public record GroupPreviewResult(UUID orderId, int total, int used, int cancelled, int remainingValid) {}

    public record GroupConfirmResult(int admitted, List<UUID> admittedTicketIds, int remainingValid) {}

    public record ApiError(String error, OffsetDateTime scannedAt, Integer remainingValid) {
        public static ApiError of(String error) { return new ApiError(error, null, null); }
        public static ApiError alreadyUsed(OffsetDateTime scannedAt) { return new ApiError("ALREADY_USED", scannedAt, null); }
        public static ApiError tooMany(int remaining) { return new ApiError("REQUESTED_MORE_THAN_REMAINING", null, remaining); }
    }
}
