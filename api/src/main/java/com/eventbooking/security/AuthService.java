package com.eventbooking.security;

import com.eventbooking.Enumeration.Provider;
import com.eventbooking.Enumeration.Role;
import com.eventbooking.dto.auth.LoginRequest;
import com.eventbooking.dto.auth.MeResponse;
import com.eventbooking.dto.auth.ChangePasswordRequest;
import com.eventbooking.dto.auth.SetPhoneRequest;
import com.eventbooking.dto.auth.RegisterRequest;
import com.eventbooking.dto.auth.UpdateProfileRequest;
import com.eventbooking.dto.auth.TokenResponse;
import com.eventbooking.model.AppUser;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.OrganizerProfileRepository;
import com.eventbooking.security.error.AccountDisabledException;
import com.eventbooking.security.error.EmailAlreadyRegisteredException;
import com.eventbooking.security.error.InvalidCredentialsException;
import com.eventbooking.security.error.InvalidRefreshTokenException;
import com.eventbooking.security.error.NotAuthenticatedException;
import com.eventbooking.security.error.PhoneAlreadyRegisteredException;
import com.eventbooking.security.error.PhoneAlreadySetException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Register, sign in, refresh, sign out.
 *
 * <p>This is the piece that finally joins the two halves already built:
 * {@link AppUserDetailsService} and the {@link PasswordEncoder} answer "is this
 * really you", {@link JwtService} and {@link RefreshTokenService} answer "here
 * is proof, carry it with you". Until this existed neither had ever run.
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final AppUserRepository appUserRepository;
    private final OrganizerProfileRepository organizerProfileRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;
    private final GoogleTokenVerifier googleTokenVerifier;
    private final long accessExpirationMs;

    public AuthService(AppUserRepository appUserRepository,
                       OrganizerProfileRepository organizerProfileRepository,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService,
                       RefreshTokenService refreshTokenService,
                       GoogleTokenVerifier googleTokenVerifier,
                       @Value("${app.jwt.access-expiration-ms}") long accessExpirationMs) {
        this.appUserRepository = appUserRepository;
        this.organizerProfileRepository = organizerProfileRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.refreshTokenService = refreshTokenService;
        this.googleTokenVerifier = googleTokenVerifier;
        this.accessExpirationMs = accessExpirationMs;
    }

    /**
     * Creates a LOCAL account and signs it straight in - a freshly registered
     * user should not have to type their password again immediately.
     *
     * <p>Uniqueness is checked before inserting so a duplicate is a 409 that
     * names the field, rather than a raw 23505 unpicked afterwards. The
     * database constraints remain the real guarantee: two simultaneous
     * registrations of the same number can both pass this check, and the second
     * insert is then rejected by Postgres - correctly, if less prettily.
     */
    @Transactional
    public TokenResponse register(RegisterRequest request, String userAgent) {
        if (appUserRepository.existsByPhoneE164(request.phoneE164())) {
            throw new PhoneAlreadyRegisteredException();
        }
        if (request.email() != null && !request.email().isBlank()
                && appUserRepository.existsByEmail(request.email())) {
            throw new EmailAlreadyRegisteredException();
        }

        AppUser user = appUserRepository.save(AppUser.builder()
                .phoneE164(request.phoneE164())
                .email(emptyToNull(request.email()))
                // The raw password is hashed here and never stored, logged, or
                // returned. This is the only place it is touched.
                .passwordHash(passwordEncoder.encode(request.password()))
                .displayName(request.displayName())
                .role(Role.CUSTOMER)
                .provider(Provider.LOCAL)
                .isDisabled(false)
                .build());

        log.info("Registered user {} ({})", user.getId(), user.getPhoneE164());
        return issuePair(user, userAgent);
    }

    /**
     * Exchanges credentials for a token pair.
     *
     * <p>Every failure below raises the same {@link InvalidCredentialsException}
     * with the same message. A missing user and a wrong password must be
     * indistinguishable, or the endpoint becomes a way to enumerate which phone
     * numbers hold accounts.
     */
    @Transactional
    public TokenResponse login(LoginRequest request, String userAgent) {
        AppUser user = appUserRepository.findByPhoneE164(request.phoneE164())
                .orElseThrow(InvalidCredentialsException::new);

        // A GOOGLE account has no password_hash. Rejecting it here rather than
        // letting matches() run against "" keeps the two sign-in paths separate.
        if (user.getPasswordHash() == null || user.getPasswordHash().isBlank()) {
            throw new InvalidCredentialsException();
        }

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new InvalidCredentialsException();
        }

        // Checked only AFTER the password, so a disabled account cannot be used
        // to confirm that a number is registered.
        if (Boolean.TRUE.equals(user.getIsDisabled())) {
            throw new AccountDisabledException();
        }

        log.info("User {} signed in", user.getId());
        return issuePair(user, userAgent);
    }

    /**
     * Trades a live refresh token for a new pair, burning the old one.
     *
     * <p>The access token is not consulted: it has usually expired, which is
     * the whole reason the client is here.
     */
    @Transactional
    public TokenResponse refresh(String refreshToken, String userAgent) {
        RefreshTokenService.Rotated rotated = refreshTokenService.rotate(refreshToken, userAgent)
                .orElseThrow(InvalidRefreshTokenException::new);

        AppUser user = rotated.user();
        if (Boolean.TRUE.equals(user.getIsDisabled())) {
            // Disabling an account takes effect at the next refresh, i.e. within
            // the access token's 15 minutes rather than its 14-day lifetime.
            refreshTokenService.revokeAll(user);
            throw new AccountDisabledException();
        }

        return new TokenResponse(
                jwtService.generateAccessToken(String.valueOf(user.getId()), user.getRole().name()),
                rotated.rawToken(),
                "Bearer",
                accessExpirationMs / 1000);
    }

    /**
     * Ends this session. Deliberately silent about whether the token was live:
     * logging out twice is not an error worth reporting, and a 404 here would
     * confirm which tokens exist.
     */
    @Transactional
    public void logout(String refreshToken) {
        refreshTokenService.revoke(refreshToken);
    }

    /**
     * The caller's own record, for a client that holds a token and needs to
     * know whose it is.
     *
     * <p>Re-read rather than assembled from the principal. The principal was
     * built from a row at the start of THIS request, so it is fresh enough for
     * an id and a role - but it carries neither the display name nor the
     * organiser profile, and inflating it to carry everything a screen might
     * want would put that cost on every authenticated request instead of on the
     * one call that asks.
     *
     * <p>The organiser profile is looked up unconditionally rather than only for
     * {@code Role.ORGANIZER}. Role and profile are separate facts in this schema
     * and have drifted before; asking the table is cheaper than trusting they
     * agree.
     */
    @Transactional(readOnly = true)
    public MeResponse me(Long actorUserId) {
        if (actorUserId == null) {
            throw new NotAuthenticatedException();
        }
        AppUser user = appUserRepository.findById(actorUserId)
                .orElseThrow(NotAuthenticatedException::new);

        return MeResponse.of(user,
                organizerProfileRepository.findByUserId(user.getId()).orElse(null));
    }

    /**
     * Edits the caller's own record. Returns the row as {@link #me} would.
     *
     * <p>Only ever touches the row named by {@code actorUserId}, which comes
     * from the verified token and never from the body. An id in the payload is
     * how "update my profile" quietly becomes "update anyone's profile", so
     * there is no field here to supply one.
     *
     * <p>The email uniqueness check excludes the caller's own row. Without that
     * exclusion, saving the form without touching the email - which is what
     * happens every time someone edits only their display name - collides with
     * the address already stored against this very account and comes back 409.
     */
    @Transactional
    public MeResponse updateProfile(Long actorUserId, UpdateProfileRequest request) {
        if (actorUserId == null) {
            throw new NotAuthenticatedException();
        }
        AppUser user = appUserRepository.findById(actorUserId)
                .orElseThrow(NotAuthenticatedException::new);

        String email = emptyToNull(request.email());
        if (email != null && !email.equalsIgnoreCase(user.getEmail())
                && appUserRepository.existsByEmail(email)) {
            throw new EmailAlreadyRegisteredException();
        }

        user.setDisplayName(request.displayName());
        user.setEmail(email);
        if (request.locale() != null) {
            user.setLocale(request.locale());
        }
        appUserRepository.save(user);

        log.info("User {} updated their profile", user.getId());
        return MeResponse.of(user,
                organizerProfileRepository.findByUserId(user.getId()).orElse(null));
    }

    /**
     * Replaces the password, then signs every session out and re-admits this one.
     *
     * <p>Changing a password is what someone does when they believe it is known
     * to another person, so leaving that person's session alive defeats the
     * point: {@link RefreshTokenService#revokeAll} burns every outstanding
     * refresh token, including the caller's own. A fresh pair is issued
     * immediately afterwards so the browser doing the change stays signed in -
     * every other device is logged out within the access token's 15 minutes.
     *
     * <p>A wrong current password raises {@link InvalidCredentialsException},
     * the same type login uses. This one is not an enumeration risk - the caller
     * is already authenticated and the account is their own - but answering with
     * one shape keeps "your password was wrong" from ever depending on which
     * endpoint asked.
     *
     * <p>A GOOGLE account has no hash to compare against and is refused for the
     * reason login refuses it: there is no local password to replace.
     */
    @Transactional
    public TokenResponse changePassword(Long actorUserId,
                                        ChangePasswordRequest request,
                                        String userAgent) {
        if (actorUserId == null) {
            throw new NotAuthenticatedException();
        }
        AppUser user = appUserRepository.findById(actorUserId)
                .orElseThrow(NotAuthenticatedException::new);

        if (user.getPasswordHash() == null || user.getPasswordHash().isBlank()) {
            throw new InvalidCredentialsException();
        }
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new InvalidCredentialsException();
        }

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        appUserRepository.save(user);

        int revoked = refreshTokenService.revokeAll(user);
        log.info("User {} changed their password; {} refresh tokens revoked",
                user.getId(), revoked);

        return issuePair(user, userAgent);
    }

    /**
     * Sign in with Google, creating the account on first use.
     *
     * <p>Matched on {@code provider_subject}, never on email. Google's {@code sub}
     * is permanent and belongs to exactly one account; an email address can be
     * renamed, and inside a Workspace domain it can be reassigned to a different
     * person entirely. Keying on the address would hand that person the previous
     * owner's bookings.
     *
     * <p>An existing LOCAL account with the same address is <b>not</b> adopted.
     * That would be account linking, and doing it silently means anyone who can
     * obtain a Google token for an address takes over the password account
     * holding it - the classic pre-hijack. It is refused as a conflict instead,
     * and joining the two is a deliberate action for a signed-in user, which is
     * work this does not do yet.
     *
     * <p>The row is created with no phone and no password hash. Both are
     * nullable since V9, and {@link #setPhone} is how the gap is filled - the
     * client sends the user there when {@code phone_e164} comes back null.
     */
    @Transactional
    public TokenResponse loginWithGoogle(String idToken, String userAgent) {
        GoogleTokenVerifier.GoogleIdentity identity = googleTokenVerifier.verify(idToken);

        AppUser user = appUserRepository
                .findByProviderAndProviderSubject(Provider.GOOGLE, identity.subject())
                .orElseGet(() -> {
                    if (identity.email() != null
                            && appUserRepository.existsByEmail(identity.email())) {
                        throw new EmailAlreadyRegisteredException();
                    }
                    AppUser created = appUserRepository.save(AppUser.builder()
                            .email(identity.email())
                            .displayName(identity.displayName())
                            .role(Role.CUSTOMER)
                            .provider(Provider.GOOGLE)
                            .providerSubject(identity.subject())
                            .isDisabled(false)
                            .build());
                    log.info("Created Google user {}", created.getId());
                    return created;
                });

        // Checked after the account is resolved, exactly as login does, so the
        // answer does not depend on whether the row already existed.
        if (Boolean.TRUE.equals(user.getIsDisabled())) {
            throw new AccountDisabledException();
        }

        log.info("User {} signed in with Google", user.getId());
        return issuePair(user, userAgent);
    }

    /**
     * Adds the phone number a Google account arrived without.
     *
     * <p>Set once, never edited. {@code phone_e164} is the login identifier and
     * the access token's subject, so changing it would invalidate every token
     * its owner holds and, worse, let someone move their number onto an account
     * and off it again to probe which numbers are registered. Filling a null is
     * a different operation from replacing a value, and only the first is safe
     * to expose.
     */
    @Transactional
    public MeResponse setPhone(Long actorUserId, SetPhoneRequest request) {
        if (actorUserId == null) {
            throw new NotAuthenticatedException();
        }
        AppUser user = appUserRepository.findById(actorUserId)
                .orElseThrow(NotAuthenticatedException::new);

        if (user.getPhoneE164() != null && !user.getPhoneE164().isBlank()) {
            throw new PhoneAlreadySetException();
        }
        if (appUserRepository.existsByPhoneE164(request.phoneE164())) {
            throw new PhoneAlreadyRegisteredException();
        }

        user.setPhoneE164(request.phoneE164());
        appUserRepository.save(user);
        log.info("User {} added a phone number", user.getId());

        return MeResponse.of(user,
                organizerProfileRepository.findByUserId(user.getId()).orElse(null));
    }

    // ------------------------------------------------------------------

    private TokenResponse issuePair(AppUser user, String userAgent) {
        return TokenResponse.bearer(
                jwtService.generateAccessToken(String.valueOf(user.getId()), user.getRole().name()),
                refreshTokenService.issue(user, userAgent),
                accessExpirationMs / 1000);
    }

    private static String emptyToNull(String value) {
        return Optional.ofNullable(value).filter(v -> !v.isBlank()).orElse(null);
    }
}
