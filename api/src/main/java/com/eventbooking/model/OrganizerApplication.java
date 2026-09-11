package com.eventbooking.model;

import com.eventbooking.Enumeration.OrganizerApplicationStatus;
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
 * A customer's request to become an organiser, and the decision on it.
 *
 * <p>This is deliberately NOT a pending {@link OrganizerProfile}. A profile row
 * means you are an organiser - it is the target of {@code venue.organizer_id}
 * and {@code event.organizer_id}, and the whole of OrganizerResolver's
 * authority check is that the row exists. Letting an undecided request live
 * there would hand out a usable ownership id before anyone approved it. The
 * approval path creates the profile; it does not promote this row into one.
 *
 * <p>{@code userId} and {@code reviewedBy} are raw Longs rather than
 * {@code @ManyToOne AppUser}, matching {@link OrganizerProfile#getUserId()} and
 * {@link EventReview#getActorId()}. Both are ids the caller already has.
 */
@Entity
@Table(name = "organizer_application")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrganizerApplication {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * FK to {@code app_user.id} - the applicant. Not UNIQUE: a rejected
     * applicant may apply again. Only the PENDING rows are capped at one, by
     * the partial index {@code uq_organizer_application_pending}.
     */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    /**
     * Both names are required, because {@code organizer_profile.org_name_km} is
     * NOT NULL and approval copies these straight across. A nullable Khmer name
     * here would only defer the constraint violation to the admin's click.
     */
    @Column(name = "org_name_en", nullable = false)
    private String orgNameEn;

    @Column(name = "org_name_km", nullable = false)
    private String orgNameKm;

    /**
     * A contact handle such as {@code @sokha}. Not the same thing as
     * {@code organizer_profile.telegram_chat_id}, which is the numeric id the
     * bot sends to and is only learnable once the organiser messages the bot -
     * so approval leaves that column NULL rather than copying this into it.
     */
    @Column(name = "telegram_handle")
    private String telegramHandle;

    @Column(name = "facebook_url")
    private String facebookUrl;

    /** Free text, e.g. "Concert, Conference". Shown to the reviewer, never queried. */
    @Column(name = "event_types")
    private String eventTypes;

    /** The applicant's note to the reviewer. Optional. */
    @Column(name = "message")
    private String message;

    /**
     * Defaulted here as well as in the DDL: the column is NOT NULL with a
     * DEFAULT, but a builder that omits it writes an explicit NULL rather than
     * letting the default apply, so the insert would fail.
     */
    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private OrganizerApplicationStatus status = OrganizerApplicationStatus.PENDING;

    /** Required on REJECTED - enforced by a DB CHECK too. */
    @Column(name = "admin_note")
    private String adminNote;

    /**
     * app_user.id of the deciding admin, not an organizer_profile.id - admins
     * have no organiser profile. Null exactly while the row is PENDING, which
     * a DB CHECK keeps true alongside {@link #reviewedAt}.
     */
    @Column(name = "reviewed_by")
    private Long reviewedBy;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @CreationTimestamp
    @Column(name = "submitted_at", nullable = false, updatable = false)
    private Instant submittedAt;
}
