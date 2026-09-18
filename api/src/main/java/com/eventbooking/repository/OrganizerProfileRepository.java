package com.eventbooking.repository;

import com.eventbooking.model.OrganizerProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;

public interface OrganizerProfileRepository extends JpaRepository<OrganizerProfile, Long> {

    /**
     * The organisation record itself, however its owner's role stands today.
     *
     * <p>{@code Optional} rather than a list because {@code user_id} is UNIQUE
     * in V1: at most one row.
     *
     * <p>This used to be the organiser check too - a row here MEANT you were an
     * organiser. It no longer does, and callers asking "may this person act as
     * an organiser" want {@link #findActiveByUserId} instead. The profile now
     * outlives the role: demoting an organiser leaves the row in place so the
     * events, venues and payouts pointing at it keep their owner. What a
     * surviving row means is "this organisation existed", not "this person may
     * publish".
     */
    Optional<OrganizerProfile> findByUserId(Long userId);

    /**
     * The same row, but only while its owner still holds the role - the single
     * definition of "is an organiser right now".
     *
     * <p>It exists because the two facts can now disagree on purpose. A demoted
     * organiser keeps the profile and loses the role, so every gate that used
     * to read "a profile exists" would keep letting them write. Expressing the
     * join once here is what stops the next gate from being written the old way:
     * there is no second place to get this subtly wrong.
     *
     * <p>PLATFORM_ADMIN is deliberately not included. Admins act through the
     * admin endpoints, which have their own gate; a dormant profile left behind
     * by an organiser who was promoted to admin is history, not authority.
     *
     * <p>A null {@code userId} matches nothing and returns empty, which is what
     * {@code CurrentUserId} relies on to turn an unauthenticated call into a
     * clean 403 rather than a driver-level error.
     */
    @Query("""
            select p from OrganizerProfile p, AppUser u
            where p.userId = u.id
              and u.id = :userId
              and u.role = com.eventbooking.Enumeration.Role.ORGANIZER
            """)
    Optional<OrganizerProfile> findActiveByUserId(@Param("userId") Long userId);

    /**
     * Redeeming a "Connect Telegram" deep link: matches the token the webhook
     * read out of {@code /start <token>} back to whichever organiser it was
     * minted for, and refuses it once {@code telegramConnectExpiresAt} has
     * passed - an old, unused link found in a chat log should not still work.
     */
    Optional<OrganizerProfile> findByTelegramConnectTokenAndTelegramConnectExpiresAtAfter(
            String telegramConnectToken, Instant now);

    /**
     * The other direction: an already-connected chat sends the bot a message
     * (a {@code /stats}, or anything else), and the webhook needs to know
     * whose organiser this chat belongs to before it can answer.
     */
    Optional<OrganizerProfile> findByTelegramChatId(String telegramChatId);
}
