package com.eventbooking.model;

import com.eventbooking.Enumeration.HoldStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "hold")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Hold {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id", nullable = false)
    private Event event;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private HoldStatus status = HoldStatus.ACTIVE;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    @Builder.Default
    private boolean extended = false;

    // No `@OneToMany(mappedBy = "hold") List<EventSeat>` here: EventSeat maps
    // hold_id as a raw Long rather than an association, so a mappedBy pointing
    // at a non-existent EventSeat.hold property stops the Spring context from
    // starting. Load a hold's seats through
    // EventSeatRepository.findByHoldIdForUpdate instead - checkout wants them
    // row-locked anyway, which a lazy collection would not give it.
}
