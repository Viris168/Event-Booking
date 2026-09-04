package com.eventbooking.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
 * The organiser identity that owns venues and events.
 *
 * <p>This table has existed since V1 and is the target of
 * {@code venue.organizer_id} and {@code event.organizer_id}, but nothing in
 * Java mapped it - the only writer was a raw JdbcTemplate INSERT in the seeder.
 * That left the two id spaces silently disconnected: callers identify
 * themselves with an {@code app_user.id}, while every ownership column holds an
 * {@code organizer_profile.id}. Nothing could bridge them, so ownership went
 * unchecked and the client supplied its own owner id instead.
 *
 * <p>{@code userId} is a raw Long rather than a {@code @ManyToOne AppUser}. It
 * matches how {@code Venue.organizerId} and {@code Event.organizerId} already
 * store their FK, and it keeps a lazy proxy out of a lookup that now runs on
 * every organiser request - the resolver wants the id, never the user.
 */
@Entity
@Table(name = "organizer_profile")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrganizerProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** FK to {@code app_user.id}. UNIQUE in V1 - one profile per user. */
    @Column(name = "user_id", nullable = false, unique = true)
    private Long userId;

    @Column(name = "org_name_en", nullable = false)
    private String orgNameEn;

    @Column(name = "org_name_km", nullable = false)
    private String orgNameKm;

    @Column(name = "telegram_chat_id")
    private String telegramChatId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
