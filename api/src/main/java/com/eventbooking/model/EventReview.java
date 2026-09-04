package com.eventbooking.model;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.EventTransition;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

/**
 * One row per lifecycle transition. Append-only: never updated, never deleted,
 * so the sequence of decisions on an event stays reconstructible.
 *
 * <p>There is deliberately no setter-driven update path and no repository
 * delete - the value of this table is that it can be trusted, and a mutable
 * audit log is just a table.
 */
@Entity
@Table(name = "event_review")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EventReview {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id", nullable = false)
    private Event event;

    /**
     * app_user.id, not organizer_profile.id. Admins have no organiser profile,
     * and the log has to name both sides of the conversation.
     */
    @Column(name = "actor_id", nullable = false)
    private Long actorId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EventTransition action;

    /** Required for REJECT and REQUEST_CHANGES - enforced by a DB CHECK too. */
    @Column(name = "message")
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", nullable = false)
    private EventStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", nullable = false)
    private EventStatus toStatus;

    /**
     * The reviewable fields as they stood at this decision, as JSON. Null for
     * transitions that change no content.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "snapshot", columnDefinition = "jsonb")
    private String snapshot;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
