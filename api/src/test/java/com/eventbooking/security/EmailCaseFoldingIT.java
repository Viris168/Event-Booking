package com.eventbooking.security;

import com.eventbooking.dto.auth.RegisterRequest;
import com.eventbooking.exception.security.EmailAlreadyRegisteredException;
import com.eventbooking.repository.AppUserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/**
 * An address identifies one account whatever case it is typed in.
 *
 * <p>Against a real Postgres, because the guarantee being tested is a partial
 * unique index on {@code lower(email)} - H2 would model neither the expression
 * index nor the byte-for-byte comparison that made this necessary.
 *
 * <p>The bug: {@code app_user.email} carried a plain UNIQUE, nothing folded the
 * case on the way in, and the duplicate check in
 * {@link AuthService#loginWithGoogle} asked with {@code =}. Google always hands
 * back a lower-case address and a person filling in the registration form does
 * not, so registering as Vannara@gmail.com and later signing in with Google as
 * vannara@gmail.com matched nothing, was allowed through, and left one person
 * holding two accounts with their bookings split between them - the outcome
 * V24 exists to prevent, reached by going around the comparison instead of
 * through it.
 */
@SpringBootTest
@Testcontainers
class EmailCaseFoldingIT {

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
        // Both guards reject the placeholders from application.yml, and this
        // class runs without the dev profile, so the context dies before any
        // test body without these.
        registry.add("app.ticket.signing-secret",
                () -> "email-case-folding-it-signing-secret-32");
        registry.add("app.jwt.secret",
                () -> "email-case-folding-it-jwt-secret-at-least-32");
    }

    /** Phone is UNIQUE and these tests share a database, so no two may collide. */
    private static final AtomicInteger SEQ = new AtomicInteger();

    @Autowired AuthService authService;
    @Autowired AppUserRepository appUserRepository;
    @Autowired JdbcTemplate jdbc;

    @MockitoBean GoogleTokenVerifier googleTokenVerifier;

    private String nextPhone() {
        return String.format("0120%05d", SEQ.incrementAndGet());
    }

    private Long register(String phone) {
        authService.register(
                new RegisterRequest(phone, "a-long-enough-password", "Test User"), "junit");
        return appUserRepository.findByPhoneE164(phone).orElseThrow().getId();
    }

    /**
     * Puts an address on an account the only way there is.
     *
     * <p>Registration takes no address any more, so every address in this table
     * arrived from Google. Google normally hands back a lower-case one; the
     * casing is varied here anyway, because the fold has to hold whatever the
     * provider sends rather than whatever it usually sends.
     */
    private Long registerWithAddress(String phone, String subject, String email) {
        Long id = register(phone);
        when(googleTokenVerifier.verify(subject + "-token"))
                .thenReturn(new GoogleTokenVerifier.GoogleIdentity(subject, email, "Test User"));
        authService.linkGoogle(id, subject + "-token");
        return id;
    }

    @Test
    void linkingStoresTheAddressFolded() {
        registerWithAddress(nextPhone(), "google-subject-fold", "  Vannara.Test@Gmail.COM  ");

        assertThat(appUserRepository.findByEmail("vannara.test@gmail.com"))
                .get()
                .extracting(u -> u.getEmail())
                .isEqualTo("vannara.test@gmail.com");
    }

    @Test
    void theDuplicateCheckNoLongerDependsOnCasing() {
        registerWithAddress(nextPhone(), "google-subject-casing-a", "Casing.Check@gmail.com");

        // A second Google identity on the same mailbox, differently cased. The
        // address is what identifies the person, so it must not land twice.
        assertThatThrownBy(() -> registerWithAddress(
                nextPhone(), "google-subject-casing-b", "CASING.CHECK@GMAIL.COM"))
                .isInstanceOf(EmailAlreadyRegisteredException.class);
    }

    @Test
    void googleSignInWillNotMintASecondAccountForADifferentlyCasedAddress() {
        registerWithAddress(nextPhone(), "google-subject-hijack", "Hijack.Target@gmail.com");
        long before = appUserRepository.count();

        // Same person, same mailbox, the casing Google actually returns.
        when(googleTokenVerifier.verify("id-token"))
                .thenReturn(new GoogleTokenVerifier.GoogleIdentity(
                        "google-subject-1", "hijack.target@gmail.com", "Hijack Target"));

        assertThatThrownBy(() -> authService.loginWithGoogle("id-token", "junit"))
                .isInstanceOf(EmailAlreadyRegisteredException.class);

        assertThat(appUserRepository.count())
                .as("refused, not quietly given a second account")
                .isEqualTo(before);
    }

    @Test
    void theIndexRefusesACaseVariantEvenWithTheServiceCheckBypassed() {
        registerWithAddress(nextPhone(), "google-subject-index", "Index.Guard@gmail.com");

        // Straight to the table, as a second concurrent registration would
        // arrive after both had passed the application check.
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO app_user (phone_e164, email, display_name) VALUES (?, ?, ?)",
                nextPhone(), "INDEX.GUARD@gmail.com", "Racing Insert"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void anAccountWithNoAddressIsStillAllowed() {
        // The index is partial, and a null email is now the state every account
        // starts in - it stays null until Google supplies one - so the column
        // must hold any number of them.
        register(nextPhone());
        register(nextPhone());

        assertThat(appUserRepository.count()).isPositive();
    }
}
