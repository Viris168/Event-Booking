package com.eventbooking.payment;

import com.eventbooking.booking.BookingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The clock behind the payment lane. Two timers, doing two different jobs that
 * are easy to confuse:
 *
 * <ul>
 *   <li>{@link #pollOpenPayments()} - seconds apart. Asks Bakong whether any
 *       outstanding QR has been paid, and confirms the booking when one has.
 *       This is the loop a customer is watching.</li>
 *   <li>{@link #expireStaleBookings()} - a minute apart. The timeout that
 *       actually matters commercially: a booking nobody paid for is expired and
 *       its seats and zone capacity go back on sale. Until this runs, an
 *       abandoned checkout is holding inventory somebody else wants.</li>
 * </ul>
 *
 * <p>A QR expiring is <em>not</em> the second one. It only fails the attempt
 * and returns the booking to PAYMENT_FAILED, where the customer keeps their
 * seats and can try again - see {@code PaymentService.expire}.
 *
 * <p>Both are {@code fixedDelay}, so the next run is measured from the end of
 * the last: a slow sweep spaces itself out instead of piling up. Turn the pair
 * off with {@code app.payment.poll.enabled=false} - which is what a second
 * instance would want, since nothing here coordinates across processes yet.
 */
@Component
@ConditionalOnProperty(prefix = "app.payment.poll", name = "enabled", havingValue = "true", matchIfMissing = true)
public class PaymentPoller {

    private static final Logger log = LoggerFactory.getLogger(PaymentPoller.class);

    private final PaymentReconciler reconciler;
    private final BookingService bookingService;

    public PaymentPoller(PaymentReconciler reconciler, BookingService bookingService) {
        this.reconciler = reconciler;
        this.bookingService = bookingService;
    }

    @Scheduled(
            fixedDelayString = "${app.payment.poll.interval}",
            initialDelayString = "${app.payment.poll.interval}")
    public void pollOpenPayments() {
        try {
            reconciler.sweep();
        } catch (RuntimeException e) {
            // Swallowed on purpose. Spring's scheduler survives a thrown task,
            // but logging it here keeps the reason visible instead of buried in
            // the scheduler's own error handler.
            log.error("Payment sweep failed", e);
        }
    }

    @Scheduled(
            fixedDelayString = "${app.payment.poll.booking-sweep}",
            initialDelayString = "${app.payment.poll.booking-sweep}")
    public void expireStaleBookings() {
        try {
            bookingService.expireStaleBookings();
        } catch (RuntimeException e) {
            log.error("Booking expiry sweep failed", e);
        }
    }
}
