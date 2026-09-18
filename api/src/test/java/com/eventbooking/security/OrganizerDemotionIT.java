package com.eventbooking.security;

import com.eventbooking.Enumeration.Role;
import com.eventbooking.dto.admin.AdminUserUpdateRequest;
import com.eventbooking.exception.security.NotAnOrganizerException;
import com.eventbooking.model.AppUser;
import com.eventbooking.model.OrganizerProfile;
import com.eventbooking.model.Venue;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.OrganizerProfileRepository;
import com.eventbooking.repository.VenueRepository;
import com.eventbooking.service.admin.AdminUserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Demoting an organiser who has actually done something.
 *
 * <p>This used to be impossible. Demotion deleted the
 * {@code organizer_profile} row, because a row there was itself what being an
 * organiser meant - and {@code venue.organizer_id} and {@code event.organizer_id}
 * point at it, so anyone who had ever created a venue could not be demoted at
 * all. The admin screen showed "still owns 1 event(s) and 1 venue(s)" and there
 * was no reassign feature to act on it with.
 *
 * <p>Against a real Postgres rather than mocks, and that is the point of the
 * file. The gate is now {@code findActiveByUserId}, a JPQL join across two
 * entities with no mapped relation between them; the unit tests stub the
 * repository and would pass just as happily if that query did not parse.
 */
@SpringBootTest
@Testcontainers
class OrganizerDemotionIT {

    @SuppressWarnings("resource")
    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("event_booking_test")
                    .withUsername("test")
                    .withPassword("test");

    @DynamicPropertySource
    static void datasourceProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.jpa.show-sql", () -> "false");
        registry.add("app.ticket.signing-secret",
                () -> "organizer-demotion-it-signing-secret-32");
        registry.add("app.jwt.secret",
                () -> "organizer-demotion-it-jwt-secret-at-least-32");
    }

    /** Phone is UNIQUE and these tests share a database, so no two may collide. */
    private static final AtomicInteger SEQ = new AtomicInteger();

    @Autowired AdminUserService adminUserService;
    @Autowired OrganizerResolver organizerResolver;
    @Autowired AppUserRepository appUserRepository;
    @Autowired OrganizerProfileRepository organizerProfileRepository;
    @Autowired VenueRepository venueRepository;

    @MockitoBean GoogleTokenVerifier googleTokenVerifier;

    /** An admin to act as. The self-edit guard means it may not be the target. */
    private Long anAdmin() {
        return appUserRepository.save(AppUser.builder()
                .phoneE164(nextPhone())
                .displayName("Acting Admin")
                .role(Role.PLATFORM_ADMIN)
                .isDisabled(false)
                .build()).getId();
    }

    private String nextPhone() {
        return String.format("0122%05d", SEQ.incrementAndGet());
    }

    /**
     * An organiser with a venue to their name - the state that used to block.
     *
     * <p>The phone travels with them because every update carries the whole
     * form: omitting it reads as clearing it, and a separate guard refuses that
     * for an account with no other way to sign in.
     */
    private record Organiser(Long userId, Long profileId, Long venueId, String phone) {}

    private Organiser anOrganiserWhoOwnsAVenue() {
        AppUser user = appUserRepository.save(AppUser.builder()
                .phoneE164(nextPhone())
                .displayName("King Bot")
                .role(Role.ORGANIZER)
                .isDisabled(false)
                .build());

        OrganizerProfile profile = organizerProfileRepository.save(OrganizerProfile.builder()
                .userId(user.getId())
                .orgNameEn("King Bot Events")
                .orgNameKm("King Bot Events")
                .build());

        Venue venue = venueRepository.save(Venue.builder()
                .organizerId(profile.getId())
                .nameEn("Koh Pich Hall")
                .nameKm("សាលកោះពេជ្រ")
                .provinceCode("12")
                .khanDistrict("Chamkar Mon")
                .sangkatCommune("Tonle Bassac")
                .streetAddress("Koh Pich")
                .build());

        return new Organiser(user.getId(), profile.getId(), venue.getId(), user.getPhoneE164());
    }

    /** The dialog's save with only the role touched. */
    private AdminUserUpdateRequest roleChangeTo(Organiser organiser, Role role) {
        return new AdminUserUpdateRequest(
                "King Bot", null, organiser.phone(), role, null, null);
    }

    @Test
    void demotesAnOrganiserWhoStillOwnsAVenue() {
        Organiser organiser = anOrganiserWhoOwnsAVenue();

        adminUserService.update(anAdmin(), organiser.userId(), roleChangeTo(organiser, Role.CUSTOMER));

        assertThat(appUserRepository.findById(organiser.userId()).orElseThrow().getRole())
                .as("the demotion goes through instead of being refused")
                .isEqualTo(Role.CUSTOMER);
    }

    @Test
    void demotionRevokesTheAbilityToActAsAnOrganiser() {
        Organiser organiser = anOrganiserWhoOwnsAVenue();
        assertThat(organizerResolver.requireOrganizerId(organiser.userId()))
                .isEqualTo(organiser.profileId());

        adminUserService.update(anAdmin(), organiser.userId(), roleChangeTo(organiser, Role.CUSTOMER));

        /*
         * The half that is easy to get wrong. Only /api/v1/organizer/** is
         * role-gated in SecurityConfig - /api/v1/events/** and /api/v1/venue/**
         * have no gate but this resolver, so a demotion that left the profile
         * readable here would take the role away and change nothing at all.
         */
        assertThatThrownBy(() -> organizerResolver.requireOrganizerId(organiser.userId()))
                .isInstanceOf(NotAnOrganizerException.class);
    }

    @Test
    void theVenueKeepsItsOwner() {
        Organiser organiser = anOrganiserWhoOwnsAVenue();

        adminUserService.update(anAdmin(), organiser.userId(), roleChangeTo(organiser, Role.CUSTOMER));

        assertThat(organizerProfileRepository.findById(organiser.profileId()))
                .as("the profile is dormant, not deleted - rows point at it")
                .isPresent();
        assertThat(venueRepository.findById(organiser.venueId()).orElseThrow().getOrganizerId())
                .as("and the venue still belongs to whoever ran it")
                .isEqualTo(organiser.profileId());
    }

    @Test
    void rePromotingReusesTheSameProfileRatherThanStartingASecondOrganisation() {
        Organiser organiser = anOrganiserWhoOwnsAVenue();
        adminUserService.update(anAdmin(), organiser.userId(), roleChangeTo(organiser, Role.CUSTOMER));

        adminUserService.update(anAdmin(), organiser.userId(), roleChangeTo(organiser, Role.ORGANIZER));

        assertThat(organizerResolver.requireOrganizerId(organiser.userId()))
                .as("they get their old organisation back, venue and all")
                .isEqualTo(organiser.profileId());
    }

    @Test
    void aSuppliedNameRenamesTheDormantOrganisationInsteadOfBeingDropped() {
        Organiser organiser = anOrganiserWhoOwnsAVenue();
        adminUserService.update(anAdmin(), organiser.userId(), roleChangeTo(organiser, Role.CUSTOMER));

        adminUserService.update(anAdmin(), organiser.userId(), new AdminUserUpdateRequest(
                "King Bot", null, organiser.phone(), Role.ORGANIZER, "King Bot Productions", null));

        assertThat(organizerProfileRepository.findById(organiser.profileId()).orElseThrow()
                .getOrgNameEn())
                .isEqualTo("King Bot Productions");
    }

    @Test
    void aDemotedOrganiserIsNoLongerShownAsOneByTheProfileLookup() {
        Organiser organiser = anOrganiserWhoOwnsAVenue();

        adminUserService.update(anAdmin(), organiser.userId(), roleChangeTo(organiser, Role.CUSTOMER));

        assertThat(organizerProfileRepository.findActiveByUserId(organiser.userId()))
                .as("what /me reads, so a demoted account shows no organisation")
                .isEmpty();
        assertThat(organizerProfileRepository.findByUserId(organiser.userId()))
                .as("while the record of the organisation is still there")
                .isPresent();
    }
}
