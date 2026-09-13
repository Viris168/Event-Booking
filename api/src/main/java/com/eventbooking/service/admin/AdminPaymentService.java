package com.eventbooking.service.admin;

import com.eventbooking.Enumeration.PaymentProvider;
import com.eventbooking.Enumeration.PaymentStatus;
import com.eventbooking.dto.admin.AdminPaymentResponse;
import com.eventbooking.model.Booking;
import com.eventbooking.model.Event;
import com.eventbooking.model.PaymentTransaction;
import com.eventbooking.repository.PaymentTransactionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * The admin payments screen, served from payment_transaction.
 *
 * <p>Not the {@code payments} table, which holds ABA PayWay's own request and
 * response payload and exists for that integration's benefit.
 * {@code payment_transaction} is this system's record of an attempt to collect
 * a booking's money, whichever provider it went through, and is the only one of
 * the two that can answer "what is outstanding".
 */
@Service
public class AdminPaymentService {

    /**
     * How long an attempt may stay open before it is worth a human looking at.
     *
     * <p>One hour, carried over from the prototype. It is long enough that a
     * customer who wandered off mid-KHQR is not flagged, and short enough that
     * a provider callback that never arrived shows up the same morning.
     */
    public static final Duration STUCK_AFTER = Duration.ofHours(1);

    private final PaymentTransactionRepository paymentRepository;

    public AdminPaymentService(PaymentTransactionRepository paymentRepository) {
        this.paymentRepository = paymentRepository;
    }

    /**
     * Payment attempts, newest first.
     *
     * @param provider  exact provider, or null for all.
     * @param status    exact status, or null for all.
     * @param stuckOnly keep only open attempts older than {@link #STUCK_AFTER}.
     */
    @Transactional(readOnly = true)
    public List<AdminPaymentResponse> list(PaymentProvider provider, PaymentStatus status, boolean stuckOnly) {
        Instant cutoff = Instant.now().minus(STUCK_AFTER);

        return paymentRepository.findForAdmin(provider, status).stream()
                .map(p -> toResponse(p, isStuck(p, cutoff)))
                .filter(r -> !stuckOnly || r.stuck())
                .toList();
    }

    /**
     * Open, and opened before the cutoff.
     *
     * <p>{@code isOpen()} rather than a literal status list: PaymentStatus
     * already owns which of its values are still settleable, and restating that
     * here is how the two drift apart the first time a status is added.
     */
    private static boolean isStuck(PaymentTransaction p, Instant cutoff) {
        return p.getStatus().isOpen()
                && p.getCreatedAt() != null
                && !p.getCreatedAt().isAfter(cutoff);
    }

    private static AdminPaymentResponse toResponse(PaymentTransaction p, boolean stuck) {
        Booking b = p.getBooking();
        Event e = b == null ? null : b.getEvent();
        return new AdminPaymentResponse(
                p.getId(),
                p.getProvider(),
                p.getStatus(),
                p.getCurrencyCharged(),
                p.getAmountUsdCents(),
                p.getAmountKhr(),
                p.getProviderRef(),
                p.getCreatedAt(),
                p.getExpiresAt(),
                p.getResolvedAt(),
                stuck,
                b == null ? null : b.getId(),
                b == null ? null : b.getBookingRef(),
                b == null ? null : b.getState(),
                b == null ? null : b.getBuyerName(),
                e == null ? null : e.getId(),
                e == null ? null : e.getTitleEn(),
                e == null ? null : e.getTitleKm());
    }
}
