package com.eventbooking.repository;

import com.eventbooking.model.OrganizerProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Optional;

public interface OrganizerProfileRepository extends JpaRepository<OrganizerProfile, Long> {

    /**
     * The one lookup that converts a caller's {@code app_user.id} into the
     * {@code organizer_profile.id} that ownership columns are written in.
     *
     * <p>{@code Optional} rather than a list because {@code user_id} is UNIQUE
     * in V1: at most one row, and an empty result is meaningful - it is how a
     * CUSTOMER is told apart from an ORGANIZER. See OrganizerResolver.
     */
    Optional<OrganizerProfile> findByUserId(Long userId);

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
