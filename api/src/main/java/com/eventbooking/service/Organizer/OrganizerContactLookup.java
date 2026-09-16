package com.eventbooking.service.Organizer;

import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.OrganizerApplicationRepository;
import com.eventbooking.repository.OrganizerProfileRepository;
import org.springframework.stereotype.Component;

/**
 * How to reach an organiser off-platform, for the admin screens that need to.
 *
 * <p>The answer is less obvious than it looks, which is why it lives in one
 * place rather than being rewritten per service. An organiser's human-readable
 * Telegram handle is <b>not</b> on {@code organizer_profile}: that table holds
 * {@code telegram_chat_id}, the numeric id the bot delivers notifications to,
 * which cannot be turned into a {@code t.me} link. The handle only ever existed
 * on the organiser application they filled in, so the lookup goes profile ->
 * user -> newest application.
 *
 * <p>"Newest" matters: a rejected applicant reapplies with a fresh row rather
 * than editing the old one, so an organiser can have several, and only the last
 * one reflects the details they are currently reachable on.
 *
 * <p>Every miss along that chain is normal, not exceptional - an organiser
 * seeded directly into the database has no application at all - so the empty
 * result is a {@link Contact} of nulls rather than an exception.
 *
 * <p>The Telegram handle is read from {@code app_user.telegram_username} (V32)
 * first, and only falls back to the application's when the account has none.
 * The account field wins because it is the one its owner can still edit: the
 * application is a document submitted once and never revised, so an organiser
 * who changes Telegram updates the account panel and nothing else. Preferring
 * the application would pin admins to whatever handle was true on the day they
 * applied. The application remains the fallback for the organiser who never
 * filled the account field in, and Facebook has no equivalent - it lives on
 * the application alone.
 */
@Component
public class OrganizerContactLookup {

    /** Both fields are free text the organiser typed; neither is required. */
    public record Contact(String telegramHandle, String facebookUrl) {
        public static final Contact NONE = new Contact(null, null);
    }

    private final OrganizerProfileRepository organizerProfileRepository;
    private final OrganizerApplicationRepository organizerApplicationRepository;
    private final AppUserRepository appUserRepository;

    public OrganizerContactLookup(OrganizerProfileRepository organizerProfileRepository,
                                  OrganizerApplicationRepository organizerApplicationRepository,
                                  AppUserRepository appUserRepository) {
        this.organizerProfileRepository = organizerProfileRepository;
        this.organizerApplicationRepository = organizerApplicationRepository;
        this.appUserRepository = appUserRepository;
    }

    /**
     * @param organizerId an {@code organizer_profile.id}, not an
     *                    {@code app_user.id} - the two are different keys and
     *                    the profile is what payouts and events both carry.
     * @return the contact details, never null; {@link Contact#NONE} when there
     *         is no profile, and nulls in place of anything nobody supplied.
     */
    public Contact forOrganizer(Long organizerId) {
        if (organizerId == null) return Contact.NONE;

        var profile = organizerProfileRepository.findById(organizerId).orElse(null);
        if (profile == null) return Contact.NONE;

        var application = organizerApplicationRepository
                .findByUserIdOrderBySubmittedAtDesc(profile.getUserId())
                .stream()
                .findFirst()
                .orElse(null);

        String telegram = appUserRepository.findById(profile.getUserId())
                .map(u -> blankToNull(u.getTelegramUsername()))
                .orElse(null);
        if (telegram == null && application != null) {
            telegram = blankToNull(application.getTelegramHandle());
        }

        String facebook = application == null ? null : blankToNull(application.getFacebookUrl());
        if (telegram == null && facebook == null) return Contact.NONE;
        return new Contact(telegram, facebook);
    }

    /**
     * A handle typed as spaces is a handle nobody gave. The application fields
     * are free text with no NOT NULL and no trim behind them, so "present but
     * empty" is a real state there - and it must fall through to the other
     * field rather than render a dead t.me link.
     */
    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
