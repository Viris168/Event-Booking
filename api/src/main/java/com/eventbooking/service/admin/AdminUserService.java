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
import com.eventbooking.exception.security.UserNotFoundException;
import com.eventbooking.model.AppUser;
import com.eventbooking.model.Booking;
import com.eventbooking.model.OrganizerProfile;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.OrganizerProfileRepository;
import com.eventbooking.repository.VenueRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
     * What counts as money this account has spent. REFUND_REQUESTED is in here
     * with CONFIRMED because asking for a refund does not un-take the payment -
     * only REFUNDED does, and that state is deliberately absent.
     */
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

    private static final Set<BookingStatus> SPEND_STATES =
            Collections.unmodifiableSet(EnumSet.of(BookingStatus.CONFIRMED, BookingStatus.REFUND_REQUESTED));

    private final AppUserRepository userRepository;
    private final BookingRepository bookingRepository;
    private final OrganizerProfileRepository organizerProfileRepository;
    private final EventRepository eventRepository;
    private final VenueRepository venueRepository;

    public AdminUserService(AppUserRepository userRepository,
                            BookingRepository bookingRepository,
                            OrganizerProfileRepository organizerProfileRepository,
                            EventRepository eventRepository,
                            VenueRepository venueRepository) {
        this.userRepository = userRepository;
        this.bookingRepository = bookingRepository;
        this.organizerProfileRepository = organizerProfileRepository;
        this.eventRepository = eventRepository;
        this.venueRepository = venueRepository;
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

        return users.stream()
                .map(u -> toResponse(u, byUser.getOrDefault(u.getId(), List.of())))
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
     * is the part that needs a transaction around it: an ORGANIZER role is not
     * a column value but a column value <em>and</em> an {@code organizer_profile}
     * row, and the two have to move together or the platform ends up with an
     * organiser who cannot write (role, no profile) or a customer who can (no
     * role, profile) - OrganizerResolver reads the profile, everything else
     * reads the role.
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
            if (existing.isEmpty()) {
                String nameEn = emptyToNull(request.orgNameEn());
                String nameKm = emptyToNull(request.orgNameKm());
                if (nameEn == null && nameKm == null) {
                    throw new RoleChangeBlockedException(
                            "Making someone an organiser needs an organisation name - it is printed on "
                                    + "every event they publish.");
                }
                /*
                 * The same row OrganizerServiceimpl.approve creates, and for
                 * the same reason: since V13 a row here IS what being an
                 * organiser means. One name given and the other blank mirrors
                 * the rest of the product's _en/_km handling - both columns are
                 * NOT NULL, so the given one stands in rather than a guess
                 * being invented for the other.
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
            }
        } else if (existing.isPresent()) {
            /*
             * Leaving the role means the profile goes, or OrganizerResolver
             * keeps granting organiser writes to a demoted account - the flag
             * would be decorative in exactly the way AdminResolver's own note
             * refuses to let is_disabled be.
             *
             * But event.organizer_id and venue.organizer_id point at that row,
             * so it can only go if nothing is hanging off it. Refusing is the
             * honest answer: the alternative is deciding on an admin's behalf
             * what happens to somebody's published events.
             */
            OrganizerProfile profile = existing.get();
            long events = eventRepository.countByOrganizerId(profile.getId());
            long venues = venueRepository.countByOrganizerId(profile.getId());
            if (events > 0 || venues > 0) {
                throw new RoleChangeBlockedException(
                        user.getDisplayName() + " still owns " + events + " event(s) and " + venues
                                + " venue(s). Remove or reassign those before changing the role.");
            }
            organizerProfileRepository.delete(profile);
            log.info("Admin {} removed the organizer profile of user {}", actorAdminUserId, user.getId());
        }

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
        return toResponse(user, bookingRepository.findByUserIdInOrderByCreatedAtDesc(List.of(user.getId())));
    }

    /** The list path's variant: bookings already fetched for everyone at once. */
    private static AdminUserResponse toResponse(AppUser user, List<Booking> bookings) {
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
