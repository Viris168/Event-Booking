package com.ticketing.api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "tickets")
@Getter
@Setter
public class Ticket {

    public enum Status { VALID, USED, CANCELLED }

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Column(name = "event_id", nullable = false)
    private UUID eventId;

    @Column(name = "ticket_code_hash", nullable = false)
    private String ticketCodeHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @Column(name = "scanned_at")
    private OffsetDateTime scannedAt;

    @Column(name = "scanned_by")
    private UUID scannedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;
}
