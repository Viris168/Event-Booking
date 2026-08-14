package com.eventbooking.model;

import com.eventbooking.Enumeration.SeatStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "event_seat",
        uniqueConstraints = @UniqueConstraint(columnNames = {"event_id", "venue_seat_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EventSeat {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id", nullable = false)
    private Event event;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "venue_seat_id", nullable = false)
    private VenueSeat venueSeat;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "seat_class_id", nullable = false)
    private SeatClass seatClass;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private SeatStatus status = SeatStatus.AVAILABLE;

    // Deliberately a raw Long, not @ManyToOne Hold — see explanation below
    @Column(name = "hold_id")
    private Long holdId;

    @Column(name = "hold_expires_at")
    private Instant holdExpiresAt;

    @Version
    @Column(nullable = false)
    private Long version;
}