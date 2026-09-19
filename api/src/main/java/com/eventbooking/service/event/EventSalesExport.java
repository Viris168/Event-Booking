package com.eventbooking.service.event;

import com.eventbooking.model.Booking;
import com.eventbooking.model.Event;
import com.eventbooking.model.PaymentTransaction;
import com.eventbooking.model.Ticket;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * One event's sales, rendered as CSV.
 *
 * <p>This exists because of what force-deleting an event destroys and what the
 * platform cannot do about it. V30 removed the refund path outright - there is
 * no way to un-take money through this product, and the migration says so in
 * as many words: a cancelled show is settled out of band by whoever holds the
 * merchant account. So the one thing an admin must walk away from a force
 * delete holding is the list of people who paid and how to reach them. That
 * list is this file.
 *
 * <p>CSV rather than JSON because of who reads it. The next step after the
 * download is somebody working down a list of phone numbers refunding people,
 * and that happens in a spreadsheet.
 *
 * <p>One row per booking, not per ticket. A buyer is refunded once for what
 * they paid, so the row that matters is the booking; the ticket count rides
 * along as a column because it is what the buyer thinks they bought.
 */
final class EventSalesExport {

    /**
     * The header, and by extension the column order. Written out even when
     * there are no bookings: a file with a header and no rows says "nobody
     * bought anything", and an empty file says the export broke.
     */
    private static final String HEADER = String.join(",",
            "booking_ref",
            "booking_state",
            "buyer_name",
            "buyer_phone",
            "buyer_email",
            "tickets",
            "total_usd",
            "total_khr",
            "booked_at",
            "payment_status",
            "payment_provider",
            "provider_ref",
            "amount_paid_usd",
            "paid_at");

    private EventSalesExport() {
    }

    /**
     * Render the CSV.
     *
     * <p>Everything is passed in already loaded rather than fetched here, for
     * one reason that matters: the caller is a force delete, and it needs the
     * very same rows it is about to erase - not a second read that might miss
     * a booking placed in between. See EventForceDeletionService.
     *
     * @param payments every attempt against these bookings. The row prints the
     *                 settled one where there is one, because that is the
     *                 payment somebody is owed back; a buyer whose only attempt
     *                 failed is owed nothing and their row says so.
     */
    static String render(Event event,
                         List<Booking> bookings,
                         List<PaymentTransaction> payments,
                         List<Ticket> tickets) {

        Map<Long, PaymentTransaction> settled = payments.stream()
                .filter(p -> p.getStatus() == com.eventbooking.Enumeration.PaymentStatus.SUCCESS)
                .collect(Collectors.toMap(p -> p.getBooking().getId(), Function.identity(),
                        // uq_payment_txn_one_success_per_booking makes a
                        // collision impossible in the database. Merging rather
                        // than throwing anyway, because an export that died on
                        // a duplicate would take the whole refund list with it.
                        (a, b) -> a));

        // The latest attempt of any outcome, for the bookings with no settled
        // one. Without it those rows would print blank under every payment
        // column and read as "never tried to pay", which is a different thing
        // from "tried and the card was declined".
        Map<Long, PaymentTransaction> latest = payments.stream()
                .collect(Collectors.toMap(p -> p.getBooking().getId(), Function.identity(),
                        (a, b) -> b.getCreatedAt().isAfter(a.getCreatedAt()) ? b : a));

        Map<Long, Long> ticketCounts = tickets.stream()
                .collect(Collectors.groupingBy(t -> t.getBookingItem().getBooking().getId(),
                        Collectors.counting()));

        StringBuilder out = new StringBuilder();

        /*
         * A comment line before the header, which is not standard CSV and is
         * here on purpose: a spreadsheet shows it in cell A1, so whoever opens
         * this file weeks later knows which event it belongs to. Without it the
         * download is a list of phone numbers with no subject.
         */
        out.append(csv("Sales export for event " + event.getId() + ": " + event.getTitleEn()))
           .append(",generated ").append(Instant.now()).append('\n');
        out.append(HEADER).append('\n');

        for (Booking b : bookings) {
            PaymentTransaction p = settled.getOrDefault(b.getId(), latest.get(b.getId()));

            out.append(csv(b.getBookingRef())).append(',')
               .append(csv(b.getState().name())).append(',')
               .append(csv(b.getBuyerName())).append(',')
               .append(csv(b.getBuyerPhoneE164())).append(',')
               .append(csv(b.getBuyerEmail())).append(',')
               .append(ticketCounts.getOrDefault(b.getId(), 0L)).append(',')
               .append(usd(b.getTotalUsdCents())).append(',')
               .append(b.getTotalKhr() == null ? "" : b.getTotalKhr()).append(',')
               .append(csv(str(b.getCreatedAt()))).append(',')
               .append(csv(p == null ? "NONE" : p.getStatus().name())).append(',')
               .append(csv(p == null ? "" : p.getProvider().name())).append(',')
               .append(csv(p == null ? "" : p.getProviderRef())).append(',')
               .append(p == null ? "" : usd(p.getAmountUsdCents())).append(',')
               .append(csv(p == null ? "" : str(p.getResolvedAt())))
               .append('\n');
        }

        return out.toString();
    }

    /** Dollars, because the person reading this is filling in a refund form. */
    private static String usd(Long cents) {
        return cents == null ? "" : String.format("%d.%02d", cents / 100, Math.abs(cents % 100));
    }

    private static String str(Instant at) {
        return at == null ? "" : at.toString();
    }

    /**
     * RFC 4180 quoting.
     *
     * <p>Not optional politeness: buyer_name is free text a customer typed, so
     * a comma in it would silently shift every column after it by one and put
     * a phone number under "email" on the row somebody is about to call.
     */
    private static String csv(String value) {
        if (value == null || value.isEmpty()) return "";
        String escaped = value.replace("\"", "\"\"");
        return '"' + escaped + '"';
    }
}
