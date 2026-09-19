package com.eventbooking.security;

import com.eventbooking.Enumeration.Provider;
import com.eventbooking.Enumeration.Role;
import com.eventbooking.dto.auth.LoginRequest;
import com.eventbooking.dto.auth.MeResponse;
import com.eventbooking.dto.auth.ChangePasswordRequest;
import com.eventbooking.dto.auth.SetPasswordRequest;
import com.eventbooking.dto.auth.SetPhoneRequest;
import com.eventbooking.dto.auth.RegisterRequest;
import com.eventbooking.dto.auth.UpdateProfileRequest;
import com.eventbooking.dto.auth.TokenResponse;
import com.eventbooking.model.AppUser;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.OrganizerProfileRepository;
import com.eventbooking.exception.security.AccountDisabledException;
import com.eventbooking.exception.security.EmailAlreadyRegisteredException;
import com.eventbooking.exception.security.GoogleAlreadyLinkedException;
import com.eventbooking.exception.security.GoogleNotLinkedException;
import com.eventbooking.exception.security.InvalidCredentialsException;
import com.eventbooking.exception.security.InvalidRefreshTokenException;
import com.eventbooking.exception.security.InvalidTelegramUsernameException;
import com.eventbooking.exception.security.LastSignInMethodException;
import com.eventbooking.exception.security.NotAuthenticatedException;
import com.eventbooking.exception.security.PasswordAlreadySetException;
import com.eventbooking.exception.security.PhoneAlreadyRegisteredException;
import com.eventbooking.exception.security.PhoneAlreadySetException;
import com.eventbooking.exception.security.PhoneNumberRequiredException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

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

    /** Telegram's own rule for a handle: 5-32 of letters, digits, underscore. */
    private static final Pattern TELEGRAM_USERNAME = Pattern.compile("^[A-Za-z0-9_]{5,32}$");

    /** The decoration people put around a handle when they write one down. */
    private static final Pattern TELEGRAM_PREFIX =
            Pattern.compile("^(?:https?://)?(?:t\\.me/|telegram\\.me/)?@?", Pattern.CASE_INSENSITIVE);

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

        // No email. An account gets its address from Google when it links, which
        // is the only source here that has verified one - see RegisterRequest.
        AppUser user = appUserRepository.save(AppUser.builder()
                .phoneE164(request.phoneE164())
                // The raw password is hashed here and never stored, logged, or
                // returned. This is the only place it is touched.
                .passwordHash(passwordEncoder.encode(request.password()))
                .displayName(request.displayName())
                .role(Role.CUSTOMER)
                .provider(Provider.LOCAL)
                .isDisabled(false)
                .build());

        log.info("Registered user {}", user.getId());
        return issuePair(user, userAgent);
    }

    /**
     * Exchanges credentials for a token pair.
     *
     * <p>Every failure below raises the same {@link InvalidCredentialsException}
     * with the same message. A missing user and a wrong password must be
     * indistinguishable, or the endpoint becomes a way to enumerate which phone
     * numbers and addresses hold accounts.
     */
    @Transactional
    public TokenResponse login(LoginRequest request, String userAgent) {
        AppUser user = findByIdentifier(request.identifier())
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
     * <p>The organiser profile is looked up with {@code findActiveByUserId},
     * which joins the role in rather than testing the two facts separately.
     * They are separate facts in this schema and now disagree by design: a
     * demoted organiser keeps the profile row, because their events still point
     * at it. Reading the row alone would hand a CUSTOMER an
     * {@code organizer_profile_id} and an organisation name, which is precisely
     * what {@link com.eventbooking.dto.auth.MeResponse} promises is null for
     * them - and what AccountPanel renders an "Organisation" row from.
     */
    @Transactional(readOnly = true)
    public MeResponse me(Long actorUserId) {
        if (actorUserId == null) {
            throw new NotAuthenticatedException();
        }
        AppUser user = appUserRepository.findById(actorUserId)
                .orElseThrow(NotAuthenticatedException::new);

        return MeResponse.of(user,
                organizerProfileRepository.findActiveByUserId(user.getId()).orElse(null));
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
     *
     * <p>Every editable field is written from the request, including the ones
     * that arrive null. PATCH by method, replacement by behaviour: an omitted
     * email has always cleared the stored one, because clearing it needs to be
     * possible and a body cannot distinguish "leave it" from "empty it". The
     * Telegram handle follows that established rule rather than inventing a
     * second one, so a client sending a partial body erases what it left out.
     */
    @Transactional
    public MeResponse updateProfile(Long actorUserId, UpdateProfileRequest request) {
        if (actorUserId == null) {
            throw new NotAuthenticatedException();
        }
        AppUser user = appUserRepository.findById(actorUserId)
                .orElseThrow(NotAuthenticatedException::new);

        String email = normaliseEmail(request.email());
        if (email != null && !email.equalsIgnoreCase(user.getEmail())
                && appUserRepository.existsByEmail(email)) {
            throw new EmailAlreadyRegisteredException();
        }

        user.setDisplayName(request.displayName());
        user.setEmail(email);
        user.setTelegramUsername(normaliseTelegramUsername(request.telegramUsername()));
        appUserRepository.save(user);

        log.info("User {} updated their profile", user.getId());
        return MeResponse.of(user,
                organizerProfileRepository.findActiveByUserId(user.getId()).orElse(null));
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
        String email = normaliseEmail(identity.email());

        AppUser user = appUserRepository
                .findByProviderSubject(identity.subject())
                .orElseGet(() -> {
                    if (email != null && appUserRepository.existsByEmail(email)) {
                        throw new EmailAlreadyRegisteredException();
                    }
                    AppUser created = appUserRepository.save(AppUser.builder()
                            .email(email)
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
                organizerProfileRepository.findActiveByUserId(user.getId()).orElse(null));
    }

    /**
     * Attaches a Google identity to the account the caller is already signed in as.
     *
     * <p>Two proofs are required and both are already present: the bearer token
     * proves they hold this account, and the ID token - verified, not read -
     * proves they hold that Google account. Linking on the strength of a
     * matching email address instead would let anyone who can obtain a token
     * for an address claim the account holding it.
     *
     * <p>{@code provider} is deliberately left alone. It records how the account
     * was created, and a local account that gains a second way to sign in has
     * not stopped being a local account. What changes is
     * {@code provider_subject}, and V24's unique index is what stops the same
     * Google identity being attached to two accounts.
     */
    @Transactional
    public MeResponse linkGoogle(Long actorUserId, String idToken) {
        if (actorUserId == null) {
            throw new NotAuthenticatedException();
        }
        AppUser user = appUserRepository.findById(actorUserId)
                .orElseThrow(NotAuthenticatedException::new);

        if (user.getProviderSubject() != null) {
            throw new GoogleAlreadyLinkedException();
        }

        GoogleTokenVerifier.GoogleIdentity identity = googleTokenVerifier.verify(idToken);

        /*
         * Checked before writing so the answer is a 409 that names the problem,
         * rather than the unique index raising a 23505 nobody can act on. The
         * index remains the real guarantee: two simultaneous link attempts can
         * both pass this check.
         */
        appUserRepository.findByProviderSubject(identity.subject()).ifPresent(other -> {
            throw new GoogleAlreadyLinkedException();
        });

        user.setProviderSubject(identity.subject());

        /*
         * Google's address replaces whatever is on the account.
         *
         * <p>The stored one was typed into a form and never confirmed, so a
         * person who registered as vannara@gmial.com has an address that
         * reaches nobody and no way to discover it. Google has verified the one
         * it hands over - GoogleTokenVerifier refuses a token whose email is
         * not verified - so taking it is trading an unchecked value for a
         * checked one, and it repairs the typo without asking anyone to notice
         * it first.
         *
         * <p>Refused rather than overwritten if the address already sits on
         * another row: uq_app_user_email_lower would reject the write anyway,
         * and a constraint violation surfacing as a 500 tells the person
         * nothing. Two accounts reaching one mailbox is also the split this
         * whole fold exists to prevent.
         */
        String googleEmail = normaliseEmail(identity.email());
        if (googleEmail != null && !googleEmail.equals(user.getEmail())) {
            appUserRepository.findByEmail(googleEmail)
                    .filter(other -> !other.getId().equals(user.getId()))
                    .ifPresent(other -> {
                        throw new EmailAlreadyRegisteredException();
                    });
            user.setEmail(googleEmail);
        }

        appUserRepository.save(user);
        log.info("User {} linked a Google identity", user.getId());

        return MeResponse.of(user,
                organizerProfileRepository.findActiveByUserId(user.getId()).orElse(null));
    }

    /**
     * Detaches the Google identity, provided it is not the only way in.
     *
     * <p>An account created through Google has no password, so unlinking would
     * leave nothing to sign in with - the row would still exist, holding
     * bookings its owner can no longer reach. Refused rather than allowed with
     * a warning: the warning is read after the click.
     */
    @Transactional
    public MeResponse unlinkGoogle(Long actorUserId) {
        if (actorUserId == null) {
            throw new NotAuthenticatedException();
        }
        AppUser user = appUserRepository.findById(actorUserId)
                .orElseThrow(NotAuthenticatedException::new);

        if (user.getProviderSubject() == null) {
            throw new GoogleNotLinkedException();
        }

        boolean hasPassword = user.getPasswordHash() != null && !user.getPasswordHash().isBlank();
        boolean canSignIn = hasPassword
                && user.getPhoneE164() != null && !user.getPhoneE164().isBlank();
        if (!canSignIn) {
            throw new LastSignInMethodException();
        }

        user.setProviderSubject(null);
        appUserRepository.save(user);
        log.info("User {} unlinked their Google identity", user.getId());

        return MeResponse.of(user,
                organizerProfileRepository.findActiveByUserId(user.getId()).orElse(null));
    }

    /**
     * Gives an account its first password, so Google stops being the only way in.
     *
     * <p>No current password is asked for because there is none to ask for; the
     * bearer token is the proof, exactly as it is for every other edit to one's
     * own record. Refused outright once a hash exists - replacing a password
     * must always require knowing it, and that path is
     * {@link #changePassword}. Without that guard this endpoint would let a
     * lifted access token lock the real owner out.
     *
     * <p>A phone number is required first. It is the login identifier, so a
     * password without one is a credential that cannot be used to sign in
     * anywhere - the feature would appear to work and change nothing.
     *
     * <p>Sessions are deliberately <b>not</b> revoked. {@link #changePassword}
     * burns them because replacing a password is what someone does when they
     * believe it is known to another person. Adding a second way into an
     * account carries no such suspicion, and signing every device out would be
     * an alarming answer to a routine action.
     */
    @Transactional
    public MeResponse setPassword(Long actorUserId, SetPasswordRequest request) {
        if (actorUserId == null) {
            throw new NotAuthenticatedException();
        }
        AppUser user = appUserRepository.findById(actorUserId)
                .orElseThrow(NotAuthenticatedException::new);

        if (user.getPasswordHash() != null && !user.getPasswordHash().isBlank()) {
            throw new PasswordAlreadySetException();
        }
        if (user.getPhoneE164() == null || user.getPhoneE164().isBlank()) {
            throw new PhoneNumberRequiredException();
        }

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        appUserRepository.save(user);
        log.info("User {} set a first password", user.getId());

        return MeResponse.of(user,
                organizerProfileRepository.findActiveByUserId(user.getId()).orElse(null));
    }

    // ------------------------------------------------------------------

    private TokenResponse issuePair(AppUser user, String userAgent) {
        return TokenResponse.bearer(
                jwtService.generateAccessToken(String.valueOf(user.getId()), user.getRole().name()),
                refreshTokenService.issue(user, userAgent),
                accessExpirationMs / 1000);
    }

    private static String blankToNull(String value) {
        return Optional.ofNullable(value).map(String::trim).filter(v -> !v.isEmpty()).orElse(null);
    }

    /**
     * Resolves whatever was typed into the one field on the sign-in form.
     *
     * <p>An '@' is the test rather than a full address pattern. Both columns are
     * unique and neither can hold the other's shape - a Cambodian number never
     * contains an '@', and an address always does - so the character alone
     * decides which column to search without having to agree with the stricter
     * validation that guards writes.
     *
     * <p>Nothing is guessed at: an entry that looks like an address is looked up
     * as one and nothing else, so a typo returns the same single
     * INVALID_CREDENTIALS rather than quietly matching some other account.
     */
    private Optional<AppUser> findByIdentifier(String identifier) {
        String trimmed = identifier.trim();
        return trimmed.contains("@")
                ? appUserRepository.findByEmail(trimmed)
                : appUserRepository.findByPhoneE164(trimmed);
    }

    /**
     * Folds an address to the single form the table is indexed on.
     *
     * <p>V31 made {@code uq_app_user_email_lower} unique on {@code lower(email)}
     * and every check in this class asks its question the same way, so an
     * address kept in the casing someone happened to type would be written in
     * one form and searched for in another. Before that fold existed,
     * registering as {@code Vannara@gmail.com} and later signing in with Google
     * as {@code vannara@gmail.com} walked straight past the duplicate check in
     * {@link #loginWithGoogle} - the two strings are not equal - and split one
     * person's bookings across two accounts.
     *
     * <p>{@link Locale#ROOT} rather than the platform default. In a Turkish
     * locale {@code "I".toLowerCase()} is a dotless i, so a server that happened to be
     * configured that way would quietly corrupt every address holding a capital
     * I.
     */
    private static String normaliseEmail(String value) {
        return Optional.ofNullable(value)
                .map(v -> v.trim().toLowerCase(Locale.ROOT))
                .filter(v -> !v.isEmpty())
                .orElse(null);
    }

    /**
     * Reduces however someone wrote their Telegram handle to the handle itself.
     *
     * <p>The field asks for a username and shows a leading @, and people still
     * paste the link - their own profile is something they reach by tapping
     * "share", which produces {@code https://t.me/sokha}. All four spellings
     * name one account, so all four are accepted and stored identically;
     * web/src/lib/contactLinks.js does the same reduction on the way out, for
     * the organiser handles that arrive through a different form.
     *
     * <p>Blank clears the column, as with email. What survives the strip and is
     * still not a handle is refused rather than saved: V32's CHECK would refuse
     * it a moment later as a bare 23514, and that reaches the browser as a 500
     * with nothing to show the person who typed it.
     *
     * <p>Case is left as typed. Telegram resolves handles case-insensitively,
     * so folding would be safe for lookups - but this column is never looked up
     * by, only displayed and linked, and {@code @SokhaPhoto} is how its owner
     * writes their own name.
     */
    private static String normaliseTelegramUsername(String value) {
        String typed = blankToNull(value);
        if (typed == null) {
            return null;
        }
        String handle = TELEGRAM_PREFIX.matcher(typed).replaceFirst("")
                .replaceAll("/+$", "");
        if (handle.isEmpty()) {
            return null;
        }
        if (!TELEGRAM_USERNAME.matcher(handle).matches()) {
            throw new InvalidTelegramUsernameException();
        }
        return handle;
    }
}
