package com.eventbooking.model;

import com.eventbooking.Enumeration.NotificationType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

/**
 * One thing somebody should be told.
 *
 * <p>Addressed to a person, not to a role. The three audiences the product has
 * share this table because the recipient's role already lives on
 * {@code app_user} - fanning out to "every admin" is a query over that, and
 * splitting the storage by role would only mean writing the same list screen
 * three times.
 *
 * <p>Immutable except for {@link #readAt}. Nothing rewrites the wording of a
 * notification after the fact, because the wording is not here: only
 * {@link #type} and {@link #params} are, and the sentence is assembled in the
 * reader's language when the inbox is drawn.
 */
@Entity
@Table(name = "notification")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * A scalar rather than a {@code @ManyToOne AppUser}, for the reason
     * {@code Booking.userId} is one: the inbox is read by id and never needs the
     * user row, so a association would load a person to draw a list that already
     * knows whose list it is.
     */
    @Column(name = "recipient_user_id", nullable = false, updatable = false)
    private Long recipientUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, updatable = false)
    private NotificationType type;

    /**
     * The nouns the sentence needs, never the sentence.
     *
     * <p>A {@code Map} rather than the raw JSON string {@code EventReview.snapshot}
     * holds, because this one is read by the client rather than by a human
     * debugging a review: mapping it lets the response carry a real JSON object,
     * so the browser reads {@code params.bookingRef} instead of parsing a string
     * that happens to contain JSON.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "params", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> params = Map.of();

    /** Where clicking it goes, as a client-side route. Null for the few with nowhere to be. */
    @Column(name = "link_url", updatable = false)
    private String linkUrl;

    /**
     * What makes this occurrence distinct. Unique per (recipient, type), which is
     * what stops a polled payment from announcing itself four times.
     */
    @Column(name = "dedupe_key", nullable = false, updatable = false)
    private String dedupeKey;

    /** Null until opened. The only mutable column here. */
    @Column(name = "read_at")
    private Instant readAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
