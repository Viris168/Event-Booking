package com.eventbooking.service.admin;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.Role;
import com.eventbooking.dto.admin.AdminBookingSummary;
import com.eventbooking.dto.admin.AdminUserResponse;
import com.eventbooking.dto.admin.AdminUserUpdateRequest;
import com.eventbooking.exception.security.EmailAlreadyRegisteredException;
import com.eventbooking.exception.security.AdminLimitReachedException;
import com.eventbooking.exception.security.LastAdminException;
import com.eventbooking.exception.security.LastSignInMethodException;
import com.eventbooking.exception.security.PhoneAlreadyRegisteredException;
import com.eventbooking.exception.security.RoleChangeBlockedException;
import com.eventbooking.exception.security.UserNotDeletableException;
import com.eventbooking.exception.security.UserNotFoundException;
import com.eventbooking.model.AppUser;
import com.eventbooking.model.Booking;
import com.eventbooking.model.OrganizerProfile;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.OrganizerProfileRepository;
import com.eventbooking.repository.RefreshTokenRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The admin users screen, served from the database.
 *
 * <p>It previously ran off the web prototype's mock store, which meant the
 * moderation screen showed accounts that did not exist and, more to the point,
 * that disabling one did nothing to the real user's ability to log in.
 */
@Service
@Slf4j
public class AdminUserService {

    /**
     * How many administrators the platform will hold.
     *
     * <p>Small on purpose. Every admin sees all platform data and can act on
     * any of it - there is no per-admin scoping anywhere - so the list should
     * stay short enough to read at a glance. Three is enough that losing one
     * phone is an inconvenience rather than an incident, which is the whole
     * reason the cap is not one.
     */
    private static final int MAX_ADMINS = 3;

    /**
     * What counts as money this account has spent. CONFIRMED alone: it is the
     * only state in which a payment has settled, and nothing follows it.
     */
    private static final Set<BookingStatus> SPEND_STATES =
            Collections.unmodifiableSet(EnumSet.of(BookingStatus.CONFIRMED));

    private final AppUserRepository userRepository;
    private final BookingRepository bookingRepository;
    private final OrganizerProfileRepository organizerProfileRepository;
    private final RefreshTokenRepository refreshTokenRepository;

    public AdminUserService(AppUserRepository userRepository,
                            BookingRepository bookingRepository,
                            OrganizerProfileRepository organizerProfileRepository,
                            RefreshTokenRepository refreshTokenRepository) {
        this.userRepository = userRepository;
        this.bookingRepository = bookingRepository;
        this.organizerProfileRepository = organizerProfileRepository;
        this.refreshTokenRepository = refreshTokenRepository;
    }

    /**
     * Accounts matching the screen's three filters, with each one's booking
     * history attached.
     *
     * <p>Two queries regardless of how many users match: one for the accounts,
     * one for every booking belonging to all of them at once. The obvious
     * shape - loop the users, ask for each one's bookings - is where a list
     * endpoint quietly becomes twenty.
     *
     * @param q        free text over display name, phone and email. Blank means no filter.
     * @param role     exact role, or null for all.
     * @param disabled true for disabled only, false for active only, null for both.
     */
    @Transactional(readOnly = true)
    public List<AdminUserResponse> list(String q, Role role, Boolean disabled) {
        // Escaping and wrapping happen here rather than in the query, so the
        // repository holds no string handling and a user who types '%' searches
        // for a literal percent sign instead of matching every row.
        String needle = (q == null || q.isBlank()) ? null
                : "%" + q.trim().toLowerCase().replace("!", "!!")
                                 .replace("%", "!%")
                                 .replace("_", "!_") + "%";

        List<AppUser> users = userRepository.searchForAdmin(needle, role, disabled);
        if (users.isEmpty()) return List.of();

        List<Long> userIds = users.stream().map(AppUser::getId).toList();
        Map<Long, List<Booking>> byUser = bookingRepository
                .findByUserIdInOrderByCreatedAtDesc(userIds)
                .stream()
                .collect(Collectors.groupingBy(Booking::getUserId));

        /*
         * One more query for the whole page, not one per row. The alternative -
         * asking countReferences per user - is eleven sub-queries times twenty
         * rows to decide whether to draw a menu item.
         */
        Set<Long> withHistory = Set.copyOf(userRepository.findIdsWithHistory(userIds));

        return users.stream()
                .map(u -> toResponse(u, byUser.getOrDefault(u.getId(), List.of()),
                        !withHistory.contains(u.getId())))
                .toList();
    }

    /**
     * Lock an account out, or let it back in.
     *
     * <p>Existing bookings and tickets are deliberately untouched: someone
     * disabled mid-trip still holds a ticket somebody is going to scan, and
     * voiding it would turn a moderation decision into a person refused at a
     * gate. Disabling stops the login, nothing else.
     */
    @Transactional
    public AdminUserResponse setDisabled(Long actorAdminUserId, Long userId, boolean disabled) {
        AppUser user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException(userId));

        // Enabling is always safe - it can only ever increase the number of
        // people who can act, so none of the guards below apply to it.
        if (disabled) {
            requireAdminMayLoseAccess(actorAdminUserId, user, "disabled");
        }

        user.setIsDisabled(disabled);
        userRepository.save(user);

        return toResponse(user);
    }

    /**
     * Erase the account.
     *
     * <p>Narrow on purpose. It is for the rows that have never done anything -
     * a spam signup, a duplicate registration, a test account someone made on
     * production - where the row disappearing leaves no gap anywhere. The guard
     * below is what keeps it to those: {@code app_user} is referenced by
     * fourteen columns and only four carry an ON DELETE clause, so an account
     * with any history at all cannot be deleted without either failing or
     * taking somebody's booking history with it.
     *
     * <p>{@link #anonymize} is the action for every other case, and the refusal
     * says so. An admin reaching for delete usually wants the person gone, not
     * the records, and those are different operations on this schema.
     *
     * <p>What DOES go with the row, by cascades the schema declares: the
     * refresh tokens, the notification inbox, and any organizer application.
     * All three describe this account and nothing else. A dormant
     * {@code organizer_profile} - one created by a promotion and left behind by
     * a demotion - goes too, but only once the guard has established it owns no
     * events, venues or payouts.
     */
    @Transactional
    public void delete(Long actorAdminUserId, Long userId) {
        AppUser user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException(userId));

        // Deleting yourself is the same event as disabling yourself, only
        // permanent, so it answers to the same guard rather than a second copy
        // of the rule - including the last-admin half of it.
        requireAdminMayLoseAccess(actorAdminUserId, user, "deleted");

        AppUserRepository.UserReferences refs = userRepository.countReferences(userId);
        if (hasHistory(refs)) {
            throw new UserNotDeletableException(userId, user.getDisplayName(), refs);
        }

        /*
         * The profile before the user, because organizer_profile.user_id has no
         * ON DELETE clause. Safe only because the guard above just established
         * this profile owns no events, no venues and no payout claims - which
         * is to say it is a promotion that was never used.
         */
        organizerProfileRepository.findByUserId(userId)
                .ifPresent(organizerProfileRepository::delete);

        userRepository.delete(user);

        // Name and role in the line, not just the id: after this commits there
        // is nothing left to look the id up against, and "admin 4 deleted user
        // 812" answers no question anybody will later ask.
        log.info("Admin {} deleted user {} (\"{}\", {}, registered {})",
                actorAdminUserId, userId, user.getDisplayName(), user.getRole(), user.getCreatedAt());
    }

    /**
     * Strip the person out of the account and leave the account standing.
     *
     * <p>The answer for every user {@link #delete} refuses, and the one that is
     * usually wanted anyway: somebody asking to be removed from the platform
     * means their name and phone number, not the record that seat 4B was sold
     * on the 3rd. Those bookings are also the organiser's sales figures and the
     * platform's revenue, and they are not the customer's alone to erase.
     *
     * <p>So the identifying columns are cleared and everything else is left
     * exactly where it is. The booking rows keep their own {@code buyer_name}
     * and {@code buyer_phone_e164} - those are a snapshot taken at checkout,
     * deliberately not a join to this table, which means an anonymised account
     * does NOT blank the ticket somebody is carrying to a gate tomorrow.
     *
     * <p>Irreversible, and worth saying plainly: nothing here is recoverable
     * afterwards. There is no copy of the cleared values.
     */
    @Transactional
    public AdminUserResponse anonymize(Long actorAdminUserId, Long userId) {
        AppUser user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException(userId));

        // An anonymised account cannot sign in - there is no identifier left to
        // sign in with - so this ends the account's ability to administer just
        // as surely as disabling it, and answers to the same guard.
        requireAdminMayLoseAccess(actorAdminUserId, user, "anonymized");

        /*
         * Cleared to null rather than to a placeholder string. Both columns are
         * UNIQUE, and Postgres permits any number of NULLs in a unique index
         * but exactly one "deleted@example.com" - so placeholders would make
         * the second anonymisation on the platform fail as a 23505.
         */
        user.setPhoneE164(null);
        user.setEmail(null);
        user.setTelegramUsername(null);

        // The credential and the Google link, which are identifying in their
        // own right: provider_subject is the account's id at Google.
        user.setPasswordHash(null);
        user.setProviderSubject(null);

        // Their photograph. The Cloudinary asset itself is left alone - this
        // service has no upload lane and no CloudinaryService, and an admin
        // screen is not where an irreversible call to a third party belongs.
        user.setCloudinaryImageId(null);

        // NOT NULL, so it takes a value rather than a blank. The id is in it
        // because the admin table still lists this row and "Deleted user"
        // repeated nine times is not a list anybody can work with.
        user.setDisplayName("Deleted user " + userId);

        // Without this the row is a live account with no way to sign in, which
        // is not the same as a closed one: an admin could later set a phone
        // number on it and hand somebody else's booking history to a stranger.
        user.setIsDisabled(true);

        userRepository.saveAndFlush(user);

        /*
         * After the flush, deliberately. revokeAllForUser clears the
         * persistence context, so the changes above have to be written before
         * it runs or they are dropped - the same trap the password-change path
         * documents on that query.
         */
        int revoked = refreshTokenRepository.revokeAllForUser(user, Instant.now());

        log.info("Admin {} anonymized user {}, revoking {} session(s)",
                actorAdminUserId, userId, revoked);

        // Re-read: the context was cleared above, so the instance in hand is
        // detached and its lazy state cannot be walked for the response.
        return toResponse(userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException(userId)));
    }

    /**
     * Has this account done anything the database would keep a record of?
     *
     * <p>Every counted column, not a representative sample. A guard that misses
     * one does not fail politely - it lets the delete through to a foreign key
     * violation, which reaches the caller as a 500 and reads like a bug rather
     * than a rule. See AppUserRepository.countReferences for why they are
     * counted in one query.
     */
    private static boolean hasHistory(AppUserRepository.UserReferences r) {
        return r.getBookings() > 0
                || r.getHolds() > 0
                || r.getScans() > 0
                || r.getReviews() > 0
                || r.getCheckIns() > 0
                || r.getHandledMessages() > 0
                || r.getReviewedPayouts() > 0
                || r.getReviewedApplications() > 0
                || r.getOwnedEvents() > 0
                || r.getOwnedVenues() > 0
                || r.getOwnedPayouts() > 0;
    }

    /**
     * Refuse anything that would leave nobody able to administer the platform.
     *
     * <p>Two rules, and they apply to disabling and to demoting alike because
     * both end the same way - an account that was an administrator no longer
     * acts as one:
     *
     * <ul>
     *   <li><b>Not yourself.</b> Revoking your own access is never what this
     *       screen is for, and a mis-click on your own row is the most
     *       expensive one on it. The same reasoning already blocks changing
     *       your own role.</li>
     *   <li><b>Not the last one who can sign in.</b> Enabling an account is
     *       itself an admin action and AdminResolver refuses a disabled admin,
     *       so reaching zero cannot be undone through the API at all - only by
     *       a hand-written UPDATE against the database.</li>
     * </ul>
     *
     * <p>Counts admins who are ENABLED, not admins who exist: a disabled one
     * cannot help you back in, so counting them would let the platform reach
     * zero working administrators while reporting three.
     */
    private void requireAdminMayLoseAccess(Long actorAdminUserId, AppUser target, String action) {
        if (target.getRole() != Role.PLATFORM_ADMIN) return;

        if (target.getId().equals(actorAdminUserId)) {
            throw LastAdminException.self();
        }

        /*
         * An admin who is already disabled is not part of "who can act", so
         * taking the role off them removes nobody. Without this the guard
         * refused demoting a disabled admin whenever one enabled admin was
         * left - which is precisely when you would want to tidy the row up,
         * and there was no other way to do it.
         */
        if (Boolean.TRUE.equals(target.getIsDisabled())) return;

        if (userRepository.countByRoleAndIsDisabledFalse(Role.PLATFORM_ADMIN) <= 1) {
            throw LastAdminException.lastOne(action);
        }
    }

    /**
     * Edit somebody else's account: their name, contact details and role.
     *
     * <p>Wider than the self-service profile endpoint by two fields, for the
     * reasons on {@link AdminUserUpdateRequest}. What that record cannot express
     * is the part that needs a transaction around it: becoming an organiser is
     * not a column value but a column value <em>and</em> an
     * {@code organizer_profile} row to own things with, so a promotion has to
     * write both or leave an organiser who cannot publish.
     *
     * <p>Demotion is not symmetric with that, and deliberately so. It takes the
     * role and leaves the row - see the note further down for why the obvious
     * symmetry is what made organisers with any history undemotable.
     *
     * @param actorAdminUserId the admin making the change, for the self-edit guard.
     */
    @Transactional
    public AdminUserResponse update(Long actorAdminUserId, Long userId, AdminUserUpdateRequest request) {
        AppUser user = userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException(userId));

        String email = normaliseEmail(request.email());
        String phone = emptyToNull(request.phoneE164());

        // Checked rather than left to the UNIQUE indexes, so a second account
        // on the same number comes back as a 409 naming the field instead of a
        // raw 23505 at commit.
        if (email != null && !email.equalsIgnoreCase(user.getEmail())
                && userRepository.existsByEmail(email)) {
            throw new EmailAlreadyRegisteredException();
        }
        if (phone != null && !phone.equals(user.getPhoneE164())
                && userRepository.existsByPhoneE164(phone)) {
            throw new PhoneAlreadyRegisteredException();
        }

        /*
         * Clearing the phone is only safe when something else can still sign
         * in. phone_e164 is the login identifier for a LOCAL account, so an
         * admin blanking it on a user with no linked Google identity locks that
         * person out of a row that still holds their bookings - the same
         * outcome LastSignInMethodException already guards on the unlink path,
         * which is why it is the exception raised here too.
         */
        if (phone == null && user.getPhoneE164() != null && user.getProviderSubject() == null) {
            throw new LastSignInMethodException(
                    user.getDisplayName() + " signs in with that phone number and has no Google account "
                            + "linked, so clearing it would lock them out. Change it to a different number "
                            + "instead.");
        }

        applyRoleChange(actorAdminUserId, user, request);

        user.setDisplayName(request.displayName().trim());
        user.setEmail(email);
        user.setPhoneE164(phone);
        userRepository.save(user);

        log.info("Admin {} updated user {}", actorAdminUserId, user.getId());
        return toResponse(user);
    }

    /**
     * Move the account between roles, keeping {@code organizer_profile} in step.
     *
     * <p>No-ops when the role is unchanged, which is the common case: the edit
     * form posts every field back whether or not it was touched, and a role
     * that has not moved must not drag a profile lookup - or a refusal - along
     * with it.
     */
    private void applyRoleChange(Long actorAdminUserId, AppUser user, AdminUserUpdateRequest request) {
        Role next = request.role();
        if (next == user.getRole()) return;

        /*
         * Not "an admin may not edit themselves" - the fields above are fine to
         * correct on your own account. It is specifically the role, because
         * this is the only one of them that can revoke the access needed to put
         * it back, and there is no second admin guaranteed to exist.
         */
        if (user.getId().equals(actorAdminUserId)) {
            throw new RoleChangeBlockedException(
                    "You cannot change your own role. Ask another administrator to do it.");
        }

        /*
         * Losing PLATFORM_ADMIN is the same event as being disabled - the
         * account stops being able to administer anything - so it answers to
         * the same guard rather than a second copy of the rule.
         */
        requireAdminMayLoseAccess(actorAdminUserId, user, "demoted");

        /*
         * And the other direction. The cap counts administrators that EXIST
         * rather than ones who can sign in: a disabled admin still holds a
         * seat, because re-enabling them is one click and should never be
         * blocked by a limit.
         */
        if (next == Role.PLATFORM_ADMIN
                && userRepository.countByRole(Role.PLATFORM_ADMIN) >= MAX_ADMINS) {
            throw new AdminLimitReachedException(MAX_ADMINS);
        }

        Optional<OrganizerProfile> existing = organizerProfileRepository.findByUserId(user.getId());

        if (next == Role.ORGANIZER) {
            String nameEn = emptyToNull(request.orgNameEn());
            String nameKm = emptyToNull(request.orgNameKm());

            if (existing.isEmpty()) {
                if (nameEn == null && nameKm == null) {
                    throw new RoleChangeBlockedException(
                            "Making someone an organiser needs an organisation name - it is printed on "
                                    + "every event they publish.");
                }
                /*
                 * The same row OrganizerServiceimpl.approve creates. One name
                 * given and the other blank mirrors the rest of the product's
                 * _en/_km handling - both columns are NOT NULL, so the given one
                 * stands in rather than a guess being invented for the other.
                 *
                 * telegramChatId stays null deliberately: it is the numeric id
                 * the bot learns when the organiser first messages it, not
                 * anything an admin can type.
                 */
                organizerProfileRepository.save(OrganizerProfile.builder()
                        .userId(user.getId())
                        .orgNameEn(nameEn != null ? nameEn : nameKm)
                        .orgNameKm(nameKm != null ? nameKm : nameEn)
                        .telegramChatId(null)
                        .build());
                log.info("Admin {} created an organizer profile for user {}", actorAdminUserId, user.getId());
            } else if (nameEn != null || nameKm != null) {
                /*
                 * Re-promoting someone who was demoted: the dormant profile is
                 * waiting, with its events and venues still attached, so this
                 * reuses it rather than starting a second organisation.
                 *
                 * The names are applied rather than ignored. The admin dialog
                 * asks for them whenever the role is changing TO organiser - it
                 * cannot see whether a dormant profile exists - so dropping them
                 * here would silently discard something an admin typed and
                 * watched save. A blank field still leaves the old name alone.
                 */
                OrganizerProfile profile = existing.get();
                if (nameEn != null) profile.setOrgNameEn(nameEn);
                if (nameKm != null) profile.setOrgNameKm(nameKm);
                log.info("Admin {} reused the dormant organizer profile of user {}",
                        actorAdminUserId, user.getId());
            }
        }

        /*
         * Demotion deliberately does NOT touch the profile.
         *
         * It used to delete it, because a row in organizer_profile was itself
         * what being an organiser meant - so the row had to go or the demoted
         * account would keep writing. That made demotion and "delete this
         * organisation" the same action, and since event.organizer_id,
         * venue.organizer_id and payout_request.organizer_id all point at that
         * row, anyone who had ever done anything could not be demoted at all.
         *
         * The role is now the thing that grants access, and the profile is the
         * organisation's record. Demoting revokes the first and keeps the
         * second: the events keep an owner, the payout history stays readable,
         * and re-promoting restores the lot. OrganizerProfileRepository
         * .findActiveByUserId is what makes the revocation real.
         */
        user.setRole(next);
    }

    /**
     * One account, with the booking history and lifetime spend the table's
     * expander prints.
     *
     * <p>Every write path returns this rather than building the record inline,
     * which is what stopped {@code setDisabled} and {@code update} from drifting
     * into two different answers about the same user.
     */
    private AdminUserResponse toResponse(AppUser user) {
        return toResponse(user,
                bookingRepository.findByUserIdInOrderByCreatedAtDesc(List.of(user.getId())),
                !hasHistory(userRepository.countReferences(user.getId())));
    }

    /** The list path's variant: bookings already fetched for everyone at once. */
    private static AdminUserResponse toResponse(AppUser user, List<Booking> bookings,
                                                boolean deletable) {
        long spend = bookings.stream()
                .filter(b -> SPEND_STATES.contains(b.getState()))
                .mapToLong(b -> b.getTotalUsdCents() == null ? 0L : b.getTotalUsdCents())
                .sum();

        return new AdminUserResponse(
                user.getId(),
                user.getPhoneE164(),
                user.getEmail(),
                user.getDisplayName(),
                user.getRole(),
                Boolean.TRUE.equals(user.getIsDisabled()),
                user.getProvider(),
                user.getCreatedAt(),
                bookings.size(),
                spend,
                deletable,
                bookings.stream().map(AdminUserService::toSummary).toList());
    }

    private static AdminBookingSummary toSummary(Booking b) {
        return new AdminBookingSummary(
                b.getId(), b.getBookingRef(), b.getState(), b.getCreatedAt(), b.getTotalUsdCents());
    }

    /**
     * Blank is the form's way of saying "nothing here", and a blank string in a
     * UNIQUE column is a value - two accounts clearing their email would then
     * collide with each other over "".
     */
    private static String emptyToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * Folds an address the way AuthService does, for the same reason: since V31
     * the unique index is on {@code lower(email)}, so an admin typing an address
     * in a different casing from the one already stored would otherwise write a
     * value this table then fails to match.
     */
    private static String normaliseEmail(String value) {
        String trimmed = emptyToNull(value);
        return trimmed == null ? null : trimmed.toLowerCase(Locale.ROOT);
    }
}
