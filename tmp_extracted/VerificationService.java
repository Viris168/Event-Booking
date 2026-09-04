package com.ticketing.api.service;

import com.ticketing.api.dto.VerificationDtos.*;
import com.ticketing.api.entity.Ticket;
import com.ticketing.api.exception.ApiException;
import com.ticketing.api.repository.TicketRepository;
import com.ticketing.api.security.QrTokenService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class VerificationService {

    private final TicketRepository ticketRepository;
    private final QrTokenService qrTokenService;

    public VerificationService(TicketRepository ticketRepository, QrTokenService qrTokenService) {
        this.ticketRepository = ticketRepository;
        this.qrTokenService = qrTokenService;
    }

    /**
     * Single-guest admission. @Transactional means the PESSIMISTIC_WRITE
     * lock acquired by findByIdForUpdate is held until this method
     * returns (commit) or throws (rollback) — a concurrent scan of the
     * same ticket from another gate blocks here, not in application code.
     */
    @Transactional
    public IndividualResult verifyIndividual(UUID eventId, UUID scannerId, String qrToken) {
        var payload = qrTokenService.parseIndividual(qrToken);

        Ticket ticket = ticketRepository.findByIdForUpdate(payload.ticketId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, ApiError.of("TICKET_NOT_FOUND")));

        if (!ticket.getEventId().equals(eventId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, ApiError.of("TICKET_NOT_FOR_THIS_EVENT"));
        }
        if (ticket.getStatus() == Ticket.Status.USED) {
            throw new ApiException(HttpStatus.CONFLICT, ApiError.alreadyUsed(ticket.getScannedAt()));
        }
        if (ticket.getStatus() == Ticket.Status.CANCELLED) {
            throw new ApiException(HttpStatus.CONFLICT, ApiError.of("TICKET_CANCELLED"));
        }

        ticket.setStatus(Ticket.Status.USED);
        ticket.setScannedAt(OffsetDateTime.now());
        ticket.setScannedBy(scannerId);
        // no explicit save() needed — managed entity flushes on commit within @Transactional

        return new IndividualResult(1, ticket.getId(), ticket.getOrderId());
    }

    /** Read-only. No lock — see confirmGroup for why that's still safe. */
    public GroupPreviewResult previewGroup(UUID eventId, String qrToken) {
        var payload = qrTokenService.parseGroup(qrToken);

        List<Ticket> tickets = ticketRepository.findByOrderIdAndEventId(payload.orderId(), eventId);
        if (tickets.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, ApiError.of("ORDER_NOT_FOUND_FOR_EVENT"));
        }

        int total = tickets.size();
        int used = (int) tickets.stream().filter(t -> t.getStatus() == Ticket.Status.USED).count();
        int cancelled = (int) tickets.stream().filter(t -> t.getStatus() == Ticket.Status.CANCELLED).count();

        return new GroupPreviewResult(payload.orderId(), total, used, cancelled, total - used - cancelled);
    }

    /**
     * The only place group-order state actually changes. Locks every
     * ticket row under the order — a second confirm call for the same
     * order (two gates, or a double-tap) is serialized behind this one
     * and re-reads the post-commit remaining count, so concurrent
     * "admit N" requests can never sum to more than what's valid.
     */
    @Transactional
    public GroupConfirmResult confirmGroup(UUID eventId, UUID scannerId, UUID orderId, String admit) {
        List<Ticket> tickets = ticketRepository.findAllForOrderForUpdate(orderId, eventId);
        if (tickets.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, ApiError.of("ORDER_NOT_FOUND_FOR_EVENT"));
        }

        List<Ticket> validTickets = tickets.stream()
                .filter(t -> t.getStatus() == Ticket.Status.VALID)
                .collect(Collectors.toList());

        int admitCount;
        if ("ALL".equalsIgnoreCase(admit)) {
            admitCount = validTickets.size();
        } else {
            try {
                admitCount = Integer.parseInt(admit);
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("INVALID_ADMIT_COUNT");
            }
            if (admitCount <= 0) {
                throw new IllegalArgumentException("INVALID_ADMIT_COUNT");
            }
        }

        if (admitCount > validTickets.size()) {
            throw new ApiException(HttpStatus.CONFLICT, ApiError.tooMany(validTickets.size()));
        }
        if (admitCount == 0) {
            throw new ApiException(HttpStatus.CONFLICT, ApiError.of("NO_VALID_TICKETS_REMAINING"));
        }

        List<Ticket> toAdmit = validTickets.subList(0, admitCount);
        OffsetDateTime now = OffsetDateTime.now();
        for (Ticket t : toAdmit) {
            t.setStatus(Ticket.Status.USED);
            t.setScannedAt(now);
            t.setScannedBy(scannerId);
        }

        List<UUID> admittedIds = toAdmit.stream().map(Ticket::getId).collect(Collectors.toList());
        return new GroupConfirmResult(admittedIds.size(), admittedIds, validTickets.size() - admittedIds.size());
    }
}
