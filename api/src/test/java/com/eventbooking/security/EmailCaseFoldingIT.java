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

    private void register(String phone, String email) {
        authService.register(
                new RegisterRequest(phone, "a-long-enough-password", "Test User", email),
                "junit");
    }

    @Test
    void registrationStoresTheAddressFolded() {
        register(nextPhone(), "  Vannara.Test@Gmail.COM  ");

        assertThat(appUserRepository.findByEmail("vannara.test@gmail.com"))
                .get()
                .extracting(u -> u.getEmail())
                .isEqualTo("vannara.test@gmail.com");
    }

    @Test
    void theDuplicateCheckNoLongerDependsOnCasing() {
        register(nextPhone(), "Casing.Check@gmail.com");

        assertThatThrownBy(() -> register(nextPhone(), "CASING.CHECK@GMAIL.COM"))
                .isInstanceOf(EmailAlreadyRegisteredException.class);
    }

    @Test
    void googleSignInWillNotMintASecondAccountForADifferentlyCasedAddress() {
        register(nextPhone(), "Hijack.Target@gmail.com");
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
        register(nextPhone(), "Index.Guard@gmail.com");

        // Straight to the table, as a second concurrent registration would
        // arrive after both had passed the application check.
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO app_user (phone_e164, email, display_name) VALUES (?, ?, ?)",
                nextPhone(), "INDEX.GUARD@gmail.com", "Racing Insert"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void anAccountWithNoAddressIsStillAllowed() {
        // The index is partial; null email is the common case on this table and
        // must stay unconstrained however many rows carry it.
        register(nextPhone(), null);
        register(nextPhone(), null);

        assertThat(appUserRepository.count()).isPositive();
    }
}
