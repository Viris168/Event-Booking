package com.eventbooking.organizer;

import com.eventbooking.model.AppUser;
import com.eventbooking.model.OrganizerApplication;
import com.eventbooking.model.OrganizerProfile;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.OrganizerApplicationRepository;
import com.eventbooking.repository.OrganizerProfileRepository;
import com.eventbooking.service.Organizer.OrganizerContactLookup;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Which Telegram handle an admin screen ends up showing.
 *
 * <p>There are two places a handle can live and they disagree, which is the
 * whole reason this class exists: {@code organizer_application.telegram_handle}
 * is a document submitted once and never revised, while
 * {@code app_user.telegram_username} (V32) is a field its owner edits from the
 * account panel. The account field wins, and these cases pin that down - a
 * silent flip back would send admins to a t.me link the organiser abandoned
 * months ago, which fails in the worst way: it looks like it worked.
 */
class OrganizerContactLookupTest {

    private static final long ORGANIZER_ID = 7L;
    private static final long USER_ID = 42L;

    private OrganizerProfileRepository profiles;
    private OrganizerApplicationRepository applications;
    private AppUserRepository users;
    private OrganizerContactLookup lookup;

    @BeforeEach
    void setUp() {
        profiles = mock(OrganizerProfileRepository.class);
        applications = mock(OrganizerApplicationRepository.class);
        users = mock(AppUserRepository.class);
        lookup = new OrganizerContactLookup(profiles, applications, users);

        var profile = new OrganizerProfile();
        profile.setUserId(USER_ID);
        when(profiles.findById(ORGANIZER_ID)).thenReturn(Optional.of(profile));

        // Each test states the two contact sources it wants; the default is the
        // organiser who supplied neither.
        application(null, null);
        accountHandle(null);
    }

    // ------------------------------------------------------- which one wins

    @Test
    void prefersTheAccountHandleOverTheApplication() {
        application("from_application", null);
        accountHandle("from_account");

        assertThat(lookup.forOrganizer(ORGANIZER_ID).telegramHandle()).isEqualTo("from_account");
    }

    @Test
    void fallsBackToTheApplicationWhenTheAccountHasNoHandle() {
        application("from_application", null);

        assertThat(lookup.forOrganizer(ORGANIZER_ID).telegramHandle()).isEqualTo("from_application");
    }

    @Test
    void usesTheAccountHandleWhenThereIsNoApplicationAtAll() {
        // The organiser seeded straight into the database. Before V32 this was
        // the case that had no handle anywhere and rendered no button.
        when(applications.findByUserIdOrderBySubmittedAtDesc(USER_ID)).thenReturn(List.of());
        accountHandle("from_account");

        var contact = lookup.forOrganizer(ORGANIZER_ID);
        assertThat(contact.telegramHandle()).isEqualTo("from_account");
        assertThat(contact.facebookUrl()).isNull();
    }

    @Test
    void readsTheNewestApplicationWhenSeveralExist() {
        // A rejected applicant reapplies rather than editing the old row, so
        // the repository hands back newest-first and only the head counts.
        var newest = new OrganizerApplication();
        newest.setTelegramHandle("reapplied");
        var older = new OrganizerApplication();
        older.setTelegramHandle("first_attempt");
        when(applications.findByUserIdOrderBySubmittedAtDesc(USER_ID))
                .thenReturn(List.of(newest, older));

        assertThat(lookup.forOrganizer(ORGANIZER_ID).telegramHandle()).isEqualTo("reapplied");
    }

    // ------------------------------------------------------- present but empty

    @Test
    void treatsABlankAccountHandleAsMissing() {
        // Both fields are free text with no trim behind them, so whitespace is
        // a real stored state - and it must fall through rather than build a
        // dead link.
        application("from_application", null);
        accountHandle("   ");

        assertThat(lookup.forOrganizer(ORGANIZER_ID).telegramHandle()).isEqualTo("from_application");
    }

    @Test
    void treatsABlankApplicationHandleAsMissing() {
        application("  ", null);

        assertThat(lookup.forOrganizer(ORGANIZER_ID).telegramHandle()).isNull();
    }

    // --------------------------------------------------------------- nothing

    @Test
    void returnsNoneWhenNeitherSourceHasAnything() {
        assertThat(lookup.forOrganizer(ORGANIZER_ID))
                .isEqualTo(OrganizerContactLookup.Contact.NONE);
    }

    @Test
    void returnsNoneForAnUnknownOrganizer() {
        when(profiles.findById(999L)).thenReturn(Optional.empty());

        assertThat(lookup.forOrganizer(999L)).isEqualTo(OrganizerContactLookup.Contact.NONE);
        assertThat(lookup.forOrganizer(null)).isEqualTo(OrganizerContactLookup.Contact.NONE);
    }

    // ------------------------------------------------------------- facebook

    @Test
    void facebookStillComesFromTheApplicationOnly() {
        // V32 gave accounts a Telegram handle and nothing else, so the account
        // field must not start standing in for a source it never had.
        application(null, "https://facebook.com/viris.events");
        accountHandle("from_account");

        var contact = lookup.forOrganizer(ORGANIZER_ID);
        assertThat(contact.telegramHandle()).isEqualTo("from_account");
        assertThat(contact.facebookUrl()).isEqualTo("https://facebook.com/viris.events");
    }

    // ----------------------------------------------------------------- setup

    private void application(String telegramHandle, String facebookUrl) {
        var application = new OrganizerApplication();
        application.setTelegramHandle(telegramHandle);
        application.setFacebookUrl(facebookUrl);
        when(applications.findByUserIdOrderBySubmittedAtDesc(USER_ID))
                .thenReturn(List.of(application));
    }

    private void accountHandle(String telegramUsername) {
        var user = new AppUser();
        user.setTelegramUsername(telegramUsername);
        when(users.findById(USER_ID)).thenReturn(Optional.of(user));
    }
}
