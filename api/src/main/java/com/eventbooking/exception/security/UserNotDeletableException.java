package com.eventbooking.exception.security;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;
import com.eventbooking.repository.AppUserRepository;

import java.util.ArrayList;
import java.util.List;

/**
 * The account has history, so deleting the row would destroy records that are
 * not about the account.
 *
 * <p>Hard delete exists for one thing: the spam signup, the test account, the
 * duplicate registration - rows that have never done anything and whose
 * disappearance leaves no gap. The moment an account has a booking against it,
 * has scanned somebody in at a gate, or has reviewed an event as an admin, the
 * row is load-bearing for records that outlive the person.
 *
 * <p>Which is why the message names anonymisation rather than simply refusing.
 * The admin asking to delete a user almost always wants the person's details
 * gone, not the audit trail, and anonymise is the action that does exactly
 * that: the phone, the email and the name are cleared and the bookings keep
 * saying what was sold. Refusing without pointing there would send them looking
 * for SQL.
 *
 * <p>409, not 403: a platform admin is entitled to ask, and it is the resulting
 * state that is impossible.
 */
public class UserNotDeletableException extends ApiException {

    public UserNotDeletableException(Long userId, String displayName,
                                     AppUserRepository.UserReferences refs) {
        super(ErrorCode.USER_NOT_DELETABLE, describe(userId, displayName, refs));
    }

    /**
     * Name what is actually holding the row down.
     *
     * <p>Every blocker, not the first one found. An admin told "they have
     * bookings", who then clears those by hand and tries again, should not
     * discover a second reason - and then a third. One refusal, the whole list.
     */
    private static String describe(Long userId, String displayName,
                                   AppUserRepository.UserReferences refs) {
        List<String> reasons = new ArrayList<>();

        add(reasons, refs.getBookings(), "booking", "bookings");
        add(reasons, refs.getHolds(), "checkout", "checkouts");
        add(reasons, refs.getOwnedEvents(), "event they organize", "events they organize");
        add(reasons, refs.getOwnedVenues(), "venue they own", "venues they own");
        add(reasons, refs.getOwnedPayouts(), "payout claim", "payout claims");
        add(reasons, refs.getScans(), "ticket scan at a gate", "ticket scans at a gate");
        add(reasons, refs.getCheckIns(), "attendee they checked in", "attendees they checked in");
        add(reasons, refs.getReviews(), "event review decision", "event review decisions");
        add(reasons, refs.getReviewedPayouts(), "payout they reviewed", "payouts they reviewed");
        add(reasons, refs.getReviewedApplications(),
                "organizer application they reviewed", "organizer applications they reviewed");
        add(reasons, refs.getHandledMessages(),
                "contact message they handled", "contact messages they handled");

        String who = displayName == null || displayName.isBlank()
                ? "User " + userId
                : displayName + " (user " + userId + ")";

        return who + " cannot be deleted: the account has " + join(reasons)
                + ". Anonymize the account instead - that clears their name, phone number and email "
                + "and locks the account, while leaving those records intact.";
    }

    private static void add(List<String> into, long count, String singular, String plural) {
        if (count > 0) {
            into.add(count + " " + (count == 1 ? singular : plural));
        }
    }

    /** "a, b and c", because this is read by a person, not parsed. */
    private static String join(List<String> parts) {
        if (parts.isEmpty()) {
            // Not reachable through AdminUserService, which only raises this
            // when something was found. Worth a sentence anyway rather than
            // "the account has .", in case the backstop in
            // DatabaseExceptionTranslator ever routes here with nothing counted.
            return "records attached to it";
        }
        if (parts.size() == 1) return parts.get(0);
        return String.join(", ", parts.subList(0, parts.size() - 1))
                + " and " + parts.get(parts.size() - 1);
    }
}
