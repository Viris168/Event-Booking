package com.eventbooking.model;

import com.eventbooking.Enumeration.ContactMessageStatus;
import com.eventbooking.Enumeration.ContactTopic;
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

import java.time.Instant;

/**
 * One message sent through the public contact form.
 *
 * <p>The only row in this schema that an anonymous caller can create. Every
 * other write demands a bearer token and resolves it to an organiser or an
 * admin before it does anything; this one cannot, because the people most
 * likely to need it are exactly the people who cannot sign in - see V33 and
 * {@code ContactRateLimiter}, which is what stands in for the missing token.
 *
 * <p>{@link #userId} and {@link #handledBy} are raw Longs rather than
 * {@code @ManyToOne AppUser}, matching {@link OrganizerApplication} and
 * {@link OrganizerProfile}. Here there is a second reason: {@link #userId} is
 * null for most rows and nullable-to-one associations are the ones that
 * quietly become a query per row when the inbox renders a page of them.
 */
@Entity
@Table(name = "contact_message")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ContactMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * FK to {@code app_user.id}, or null - and null is the ordinary case, not a
     * degraded one. Filled only when the sender happened to have a valid token
     * on the request, which the controller reads opportunistically and never
     * requires.
     *
     * <p>ON DELETE SET NULL in the DDL: a closed account must not take an
     * unanswered complaint with it.
     */
    @Column(name = "user_id")
    private Long userId;

    /**
     * What the sender typed, never what their account says.
     *
     * <p>Even for a signed-in sender these are stored as given. Somebody
     * writing about a relative's booking puts that person's name and address
     * in the form, and helpfully overwriting either from the session would
     * route the reply to the wrong human being.
     */
    @Column(name = "sender_name", nullable = false)
    private String senderName;

    /** Where the reply goes. Required - a message nobody can answer is waste. */
    @Column(name = "reply_to", nullable = false)
    private String replyTo;

    /**
     * Optional second channel, stored bare: no leading {@code @}, no
     * {@code t.me/} prefix. The same normalisation V32 settled on for
     * {@code app_user.telegram_username}, so the web client's
     * {@code contactLinks.js} rebuilds the link from either column identically.
     */
    @Column(name = "telegram_username")
    private String telegramUsername;

    /** Routing, from a fixed list. The inbox filters on it. */
    @Enumerated(EnumType.STRING)
    @Column(name = "topic", nullable = false)
    private ContactTopic topic;

    @Column(name = "subject", nullable = false)
    private String subject;

    @Column(name = "body", nullable = false)
    private String body;

    /**
     * A reference the sender pasted in. Free text and never joined on: a
     * mistyped booking code is itself something support needs to see, and
     * resolving it here would turn "they gave us the wrong reference" into a
     * row that simply looks empty.
     */
    @Column(name = "booking_ref")
    private String bookingRef;

    /**
     * Defaulted here as well as in the DDL, for the reason
     * {@link OrganizerApplication#getStatus()} is: the column is NOT NULL with a
     * DEFAULT, but a builder that omits it writes an explicit NULL, which the
     * default does not rescue.
     */
    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private ContactMessageStatus status = ContactMessageStatus.NEW;

    /** Admin-only. The sender never sees it. */
    @Column(name = "admin_note")
    private String adminNote;

    /**
     * app_user.id of the admin who moved it out of NEW. Null exactly while the
     * row is NEW, which {@code contact_message_handled_consistent} keeps true
     * alongside {@link #handledAt}.
     */
    @Column(name = "handled_by")
    private Long handledBy;

    @Column(name = "handled_at")
    private Instant handledAt;

    /** Our clock, not the sender's. The inbox sorts on this. */
    @CreationTimestamp
    @Column(name = "received_at", nullable = false, updatable = false)
    private Instant receivedAt;
}
