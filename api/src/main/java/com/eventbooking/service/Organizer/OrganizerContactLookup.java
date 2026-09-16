package com.eventbooking.service.Organizer;

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
 */
@Component
public class OrganizerContactLookup {

    /** Both fields are free text the organiser typed; neither is required. */
    public record Contact(String telegramHandle, String facebookUrl) {
        public static final Contact NONE = new Contact(null, null);
    }

    private final OrganizerProfileRepository organizerProfileRepository;
    private final OrganizerApplicationRepository organizerApplicationRepository;

    public OrganizerContactLookup(OrganizerProfileRepository organizerProfileRepository,
                                  OrganizerApplicationRepository organizerApplicationRepository) {
        this.organizerProfileRepository = organizerProfileRepository;
        this.organizerApplicationRepository = organizerApplicationRepository;
    }

    /**
     * @param organizerId an {@code organizer_profile.id}, not an
     *                    {@code app_user.id} - the two are different keys and
     *                    the profile is what payouts and events both carry.
     * @return the contact details, never null; {@link Contact#NONE} when there
     *         is no profile, no application, or the applicant left both blank.
     */
    public Contact forOrganizer(Long organizerId) {
        if (organizerId == null) return Contact.NONE;

        var profile = organizerProfileRepository.findById(organizerId).orElse(null);
        if (profile == null) return Contact.NONE;

        return organizerApplicationRepository
                .findByUserIdOrderBySubmittedAtDesc(profile.getUserId())
                .stream()
                .findFirst()
                .map(a -> new Contact(a.getTelegramHandle(), a.getFacebookUrl()))
                .orElse(Contact.NONE);
    }
}
