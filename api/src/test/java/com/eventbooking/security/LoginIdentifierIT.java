package com.eventbooking.security;

import com.eventbooking.dto.auth.LoginRequest;
import com.eventbooking.dto.auth.RegisterRequest;
import com.eventbooking.exception.security.EmailAlreadyRegisteredException;
import com.eventbooking.exception.security.InvalidCredentialsException;
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
import static org.mockito.Mockito.when;

/**
 * One sign-in field, taking either the phone or the address on the account.
 *
 * <p>Against a real Postgres because the address half resolves through
 * {@code uq_app_user_email_lower} - the folded lookup V28 introduced. H2 models
 * neither the expression index nor the comparison it replaced.
 */
@SpringBootTest
@Testcontainers
class LoginIdentifierIT {

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
                () -> "login-identifier-it-signing-secret-32ch");
        registry.add("app.jwt.secret",
                () -> "login-identifier-it-jwt-secret-at-least-32");
    }

    private static final String PASSWORD = "a-long-enough-password";

    /** Phone is UNIQUE and these tests share a database, so no two may collide. */
    private static final AtomicInteger SEQ = new AtomicInteger();

    @Autowired AuthService authService;
    @Autowired com.eventbooking.repository.AppUserRepository appUserRepository;

    @MockitoBean GoogleTokenVerifier googleTokenVerifier;

    private String nextPhone() {
        return String.format("0121%05d", SEQ.incrementAndGet());
    }

    private Long register(String phone) {
        authService.register(new RegisterRequest(phone, PASSWORD, "Test User"), "junit");
        return appUserRepository.findByPhoneE164(phone).orElseThrow().getId();
    }

    /** Puts a verified address on an account the only way there is: from Google. */
    private Long registerAndLink(String phone, String subject, String email) {
        Long id = register(phone);
        when(googleTokenVerifier.verify(subject + "-token"))
                .thenReturn(new GoogleTokenVerifier.GoogleIdentity(subject, email, "Test User"));
        authService.linkGoogle(id, subject + "-token");
        return id;
    }

    private void login(String identifier) {
        authService.login(new LoginRequest(identifier, PASSWORD), "junit");
    }

    @Test
    void thePhoneStillSignsIn() {
        String phone = nextPhone();
        register(phone);

        assertThat(authService.login(new LoginRequest(phone, PASSWORD), "junit"))
                .isNotNull();
    }

    @Test
    void theAddressSignsInToo() {
        registerAndLink(nextPhone(), "google-subject-address-path", "address.path@gmail.com");

        assertThat(authService.login(
                new LoginRequest("address.path@gmail.com", PASSWORD), "junit"))
                .isNotNull();
    }

    @Test
    void theAddressIsMatchedWhateverCaseItIsTypedIn() {
        registerAndLink(nextPhone(), "google-subject-mixed", "Mixed.Case@Gmail.com");

        // Folded on both sides, so the casing someone happens to use at the
        // keyboard never decides whether they can get in.
        assertThat(authService.login(
                new LoginRequest("  MIXED.CASE@GMAIL.COM  ", PASSWORD), "junit"))
                .isNotNull();
    }

    @Test
    void anUnknownAddressIsTheSameRefusalAsAWrongPassword() {
        registerAndLink(nextPhone(), "google-subject-known", "known@gmail.com");

        // Both arms raise the one exception. A caller who could tell "no such
        // account" from "wrong password" could ask this endpoint which
        // addresses are registered.
        assertThatThrownBy(() -> login("nobody@gmail.com"))
                .isInstanceOf(InvalidCredentialsException.class);
        assertThatThrownBy(() -> authService.login(
                new LoginRequest("known@gmail.com", "not-the-password"), "junit"))
                .isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void anAccountThatOnlyHasGoogleCannotBeSignedIntoByItsAddress() {
        when(googleTokenVerifier.verify("google-only-token"))
                .thenReturn(new GoogleTokenVerifier.GoogleIdentity(
                        "google-subject-login-it", "google.only@gmail.com", "Google Only"));
        authService.loginWithGoogle("google-only-token", "junit");

        // The row has no password_hash. Reaching it by address must not become a
        // way in - matches() against an empty hash is not a credential check.
        assertThatThrownBy(() -> login("google.only@gmail.com"))
                .isInstanceOf(InvalidCredentialsException.class);
    }



    @Test
    void anAccountWithBothCredentialsIsReachedByEitherOne() {
        // A password account that later links Google. Both doors have to open
        // onto the same row: if Google minted a second account the person would
        // own two, with their bookings split between them.
        Long id = registerAndLink(
                nextPhone(), "google-subject-both-ways", "both.ways@gmail.com");

        // Door 1: the address and the password still work. Linking Google does
        // not retire the password, and the row's provider column is not consulted.
        assertThat(authService.login(
                new LoginRequest("both.ways@gmail.com", PASSWORD), "junit"))
                .isNotNull();

        // Door 2: Google resolves by provider_subject, and lands on the same row.
        authService.loginWithGoogle("google-subject-both-ways-token", "junit");
        assertThat(appUserRepository.findByEmail("both.ways@gmail.com").orElseThrow().getId())
                .as("one account, not two")
                .isEqualTo(id);
    }


    @Test
    void linkingIsRefusedWhenGooglesAddressBelongsToAnotherAccount() {
        registerAndLink(nextPhone(), "google-subject-incumbent", "incumbent@gmail.com");

        // The challenger has no address yet - it has not linked anything.
        Long challenger = register(nextPhone());

        // Google says this person owns the address already sitting on another
        // row. Adopting it would put one mailbox on two accounts, which is the
        // split the folded index exists to prevent.
        when(googleTokenVerifier.verify("contested-token"))
                .thenReturn(new GoogleTokenVerifier.GoogleIdentity(
                        "google-subject-contested", "incumbent@gmail.com", "Challenger"));

        assertThatThrownBy(() -> authService.linkGoogle(challenger, "contested-token"))
                .isInstanceOf(EmailAlreadyRegisteredException.class);

        assertThat(appUserRepository.findById(challenger).orElseThrow().getEmail())
                .as("left as it was, not half-written")
                .isNull();
    }


    @Test
    void anEntryWithAnAtSignIsNeverTriedAsAPhoneNumber() {
        String phone = nextPhone();
        register(phone);

        // The '@' sends it down the address branch and it stays there, so a
        // mistyped address cannot fall through and match some phone number.
        assertThatThrownBy(() -> login(phone + "@gmail.com"))
                .isInstanceOf(InvalidCredentialsException.class);
    }
}
