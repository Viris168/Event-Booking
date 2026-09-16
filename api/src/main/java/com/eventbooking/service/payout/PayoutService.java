package com.eventbooking.service.payout;

import com.eventbooking.Enumeration.PayoutStatus;
import com.eventbooking.dto.payout.CreatePayoutRequest;
import com.eventbooking.dto.payout.PayableEventResponse;
import com.eventbooking.dto.payout.PayoutRequestResponse;

import java.util.List;
import java.util.Map;

/**
 * Settling with organisers: what they are owed, asking for it, and the
 * platform's answer.
 *
 * <p>Both audiences live on one interface because they operate on one table and
 * the state machine is shared - splitting them would put "which states may
 * approve" in one file and "which states may be re-requested" in another, and
 * those two rules have to agree. Authorization is not shared, though: every
 * organiser-facing method takes an {@code organizerId} that the caller has
 * already resolved from a token, and every admin-facing one takes an
 * {@code adminUserId} resolved the same way. Neither ever accepts both.
 *
 * <p>The money is computed in exactly one place - {@link #request} - and frozen
 * there. {@link #payable} quotes the same arithmetic live so the organiser can
 * see what a click would be worth, but nothing else in the system recomputes an
 * invoice: once written, a payout's totals are read back verbatim.
 */
public interface PayoutService {

    // ------------------------------------------------------------ organiser

    /**
     * Finished events this organiser could claim right now.
     *
     * <p>Excludes events already claimed, and events that finished owing
     * nothing - both would only be offered so that clicking them could fail.
     * The numbers are live and will keep moving until a request freezes them.
     */
    List<PayableEventResponse> payable(Long organizerId);

    /**
     * Claim one finished event. Takes the snapshot, writes the invoice number,
     * and tells the admins.
     *
     * @throws com.eventbooking.exception.payout.EventNotFinishedException      before the event has happened
     * @throws com.eventbooking.exception.payout.NothingToPayOutException       when nothing on it ever settled
     * @throws com.eventbooking.exception.payout.PayoutAlreadyRequestedException when the event has already been claimed
     */
    PayoutRequestResponse request(Long organizerId, CreatePayoutRequest request);

    /** This organiser's payouts, newest first. Optionally one status only. */
    List<PayoutRequestResponse> listForOrganizer(Long organizerId, PayoutStatus status);

    /**
     * One payout, scoped to its owner - what the invoice page reads.
     *
     * <p>Returns an unmasked account number, and only to the organiser it
     * belongs to. See {@code PayoutRequestResponse.accountNumber}.
     */
    PayoutRequestResponse getForOrganizer(Long organizerId, Long payoutId);

    // ---------------------------------------------------------------- admin

    /** One status' worth of payouts. Longest wait first - it is a queue. */
    List<PayoutRequestResponse> queue(PayoutStatus status);

    /** How many sit in each status: the numbers on the tabs. */
    Map<PayoutStatus, Long> countsByStatus();

    /** One payout, unscoped. Admins do not own these rows, so there is nothing to scope by. */
    PayoutRequestResponse getForAdmin(Long payoutId);

    /**
     * Agree that the platform owes this. Does not move any money - see
     * {@link #markPaid}.
     */
    PayoutRequestResponse approve(Long adminUserId, Long payoutId);

    /**
     * Record that the transfer happened, against the bank's own reference.
     *
     * <p>Only from APPROVED. Paying something nobody approved is precisely the
     * control the two-state split exists to provide, so the jump is refused
     * rather than allowed as a shortcut.
     */
    PayoutRequestResponse markPaid(Long adminUserId, Long payoutId, String reference, String note);

}
