package com.eventbooking.service.notification.telegram;

import com.eventbooking.model.AppUser;
import com.eventbooking.model.Event;
import com.eventbooking.model.OrganizerApplication;
import com.eventbooking.model.PayoutRequest;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

import static com.eventbooking.service.notification.telegram.TelegramNotifier.escape;

/**
 * The wording of what the bot posts.
 *
 * <p>Separate from {@link TelegramNotifier}, which knows how to reach Telegram
 * and nothing about this product, and separate from the listener, which is
 * already long and is about deciding <em>whether</em> to notify rather than
 * what to say.
 *
 * <p>Everything a person types - an organisation name, an applicant's note - is
 * run through {@link TelegramNotifier#escape}. Telegram's HTML mode rejects the
 * whole message on an unbalanced tag, so an unescaped {@code &} in "Rock & Roll"
 * loses the notification entirely; and an organisation calling itself
 * {@code <b>URGENT</b>} would otherwise get to format text an admin reads as the
 * platform's own words.
 */
public final class TelegramMessages {

    private TelegramMessages() {}

    /**
     * Times are written in Phnom Penh local time, with the zone named.
     *
     * <p>The API stores and serves UTC (see {@code spring.jackson.time-zone}),
     * which is right for a wire format and wrong for a message someone reads on
     * a phone in Cambodia: a 7pm show would arrive announced as noon. The label
     * stays so nobody has to guess which of the two they are looking at.
     */
    private static final ZoneId KH = ZoneId.of("Asia/Phnom_Penh");
    private static final DateTimeFormatter WHEN =
            DateTimeFormatter.ofPattern("EEE d MMM yyyy, HH:mm", Locale.ENGLISH);

    private static String at(Instant instant) {
        return instant == null ? "—" : WHEN.format(instant.atZone(KH));
    }

    /** A line only when there is something to put on it. */
    private static void line(StringBuilder sb, String label, String value) {
        if (value == null || value.isBlank()) return;
        sb.append(label).append(": ").append(escape(value)).append('\n');
    }

    private static final String DIVIDER = "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬";

    /**
     * A ten-block bar for a sold percentage - the one thing in these
     * messages that reads at a glance, before a single number has actually
     * been read, which text alone cannot do.
     */
    private static String bar(int pct) {
        int filled = Math.max(0, Math.min(10, Math.round(pct / 10f)));
        return "█".repeat(filled) + "░".repeat(10 - filled);
    }

    /** One glyph standing in for a booking state, so a list of five does not read as five identical words. */
    private static String stateEmoji(String state) {
        return switch (state) {
            case "CONFIRMED" -> "✅";
            case "PENDING_PAYMENT", "AWAITING_CONFIRMATION" -> "⏳";
            case "PAYMENT_FAILED" -> "⚠️";
            case "CANCELLED", "EXPIRED" -> "❌";
            case "REFUND_REQUESTED" -> "🔄";
            case "REFUNDED" -> "💸";
            default -> "•";
        };
    }

    /**
     * Somebody wants to run events on the platform.
     *
     * <p>Carries enough to triage without opening the console: who they are and
     * how to reach them, what they say they will run, and their own words for
     * why. The decision itself still happens in the admin queue - this is the
     * nudge, and it says where to go.
     */
    public static String organizerApplication(OrganizerApplication application, AppUser applicant) {
        StringBuilder sb = new StringBuilder("🙋 <b>New organiser application</b>\n\n");

        // English only. The Khmer name is on the record and on every screen that
        // renders the application; repeating it here doubled the length of a
        // message whose whole job is to be read at a glance on a phone.
        sb.append("<b>").append(escape(application.getOrgNameEn())).append("</b>\n\n");

        if (applicant != null) {
            line(sb, "Applicant", applicant.getDisplayName());
            line(sb, "Phone", applicant.getPhoneE164());
            line(sb, "Email", applicant.getEmail());
        }
        line(sb, "Telegram", application.getTelegramHandle());
        line(sb, "Facebook", application.getFacebookUrl());
        line(sb, "Wants to run", application.getEventTypes());
        sb.append("Applied: ").append(at(application.getSubmittedAt())).append(" (Phnom Penh)\n");

        if (application.getMessage() != null && !application.getMessage().isBlank()) {
            sb.append("\n<i>").append(escape(application.getMessage())).append("</i>\n");
        }

        sb.append("\nApplication #").append(application.getId())
          .append(" — decide it under <b>Organiser applications</b> in the admin console.");
        return sb.toString();
    }

    /**
     * An event is waiting in the review queue.
     *
     * <p>What a reviewer would otherwise open the console to find out: when it
     * is, where, how it sells and for how much. Capacity and prices come off the
     * event's own zones and seat classes, which are the numbers that make an
     * event look sane or not at a glance.
     */
    public static String eventSubmitted(Event event, String organizerName) {
        StringBuilder sb = new StringBuilder("📋 <b>Event waiting for review</b>\n\n");

        // English only - see the note in organizerApplication.
        sb.append("<b>").append(escape(event.getTitleEn())).append("</b>\n\n");

        line(sb, "Organiser", organizerName);
        if (event.getVenue() != null) {
            line(sb, "Venue", event.getVenue().getNameEn());
        }
        sb.append("Starts: ").append(at(event.getStartsAt())).append(" (Phnom Penh)\n");
        sb.append("Doors: ").append(at(event.getDoorsOpenAt())).append('\n');
        sb.append("On sale: ").append(at(event.getSalesOpenAt()))
          .append(" → ").append(at(event.getSalesCloseAt())).append('\n');
        line(sb, "Category", event.getCategory());
        line(sb, "Sells as", String.valueOf(event.getInventoryMode()));

        appendInventory(sb, event);

        sb.append("\nEvent #").append(event.getId())
          .append(" — decide it in the <b>Review queue</b>.");
        return sb.toString();
    }

    /**
     * An event the recipient owns was just approved.
     *
     * <p>English only, like every other message in this file - see the note
     * on {@link #organizerApplication}. Unlike those two, though, there is no
     * stored signal to branch on even if a caller wanted to: {@code locale}
     * lives only in the browser's own {@code LocaleContext}, never written to
     * {@code app_user}, so "which language does this organiser read" is not a
     * question the backend can answer.
     */
    public static String eventApproved(Event event) {
        String title = escape(event.getTitleEn());
        return "🎉 <b>Your event was approved!</b>\n" + DIVIDER
                + "\n🎫 <b>" + title + "</b>\n\n🚀 It's live on the site — tickets can sell from here.";
    }

    /**
     * A booking on the recipient's event just confirmed - the moment their
     * in-app "tickets sold" notification already fires, mirrored to Telegram.
     *
     * <p>The event's running totals ({@code stat}) sit above this one sale's
     * own detail ({@code sale}) - same header shape {@link #eventStatsMessage}
     * uses, so "where do sales stand now" and "what just happened" both read
     * in one message instead of needing a separate {@code /stats} to answer
     * the first question.
     */
    public static String ticketSold(EventStat stat, TransactionLine sale) {
        long avg = stat.sold() > 0 ? stat.revenueUsdCents() / stat.sold() : 0;
        int pct = stat.capacity() > 0 ? (int) Math.round(100.0 * stat.sold() / stat.capacity()) : 0;

        StringBuilder sb = new StringBuilder("🎫 <b>").append(escape(stat.titleEn())).append("</b>\n")
                .append(DIVIDER).append('\n');
        sb.append(bar(pct)).append("  ").append(pct).append("%\n");
        sb.append("🎟 Sold: <b>").append(stat.sold()).append('/').append(stat.capacity()).append("</b>\n");
        sb.append("💰 Revenue: <b>").append(usd(stat.revenueUsdCents())).append("</b>")
          .append("  ·  avg ").append(usd(avg)).append("/ticket\n");
        sb.append(DIVIDER).append('\n');

        sb.append("🎉 <b>New ticket sold!</b>\n\n");
        sb.append("<code>").append(escape(sale.bookingRef())).append("</code>\n");
        if (sale.buyerName() != null && !sale.buyerName().isBlank()) {
            sb.append("👤 ").append(escape(sale.buyerName())).append('\n');
        }
        if (sale.buyerPhone() != null && !sale.buyerPhone().isBlank()) {
            sb.append("📞 ").append(escape(sale.buyerPhone())).append('\n');
        }
        sb.append("💳 ").append(escape(sale.provider() == null ? "—" : sale.provider()))
          .append("  ").append(stateEmoji(sale.state())).append(' ').append(escape(sale.state()))
          .append("  ·  ").append(usd(sale.amountUsdCents())).append('\n');
        sb.append("🕒 ").append(at(sale.createdAt()));
        return sb.toString();
    }

    /** No events at all - distinct from {@link #noSalesYet}, which has events but no sales. */
    public static String noEvents() {
        return "You don't have any events yet.";
    }

    /** Every event exists but none has sold anything - distinct from {@link #noEvents}. */
    public static String noSalesYet() {
        return "No tickets sold yet on any of your events.";
    }

    /**
     * One event's own reply to {@code /stats} - sent as its own Telegram
     * message rather than folded into one combined summary, so an organiser
     * with several events reads each on its own rather than scrolling a
     * wall of text to find the one they actually asked about.
     *
     * @param transactions the most recent few - see {@code shownCount} - not
     *                      every booking this event has ever had. Telegram
     *                      has no pagination UI, so a long list is a wall of
     *                      text no differently than combining every event
     *                      would have been; {@code totalCount} says how many
     *                      more there are rather than silently truncating.
     */
    public static String eventStatsMessage(EventStat stat, List<TransactionLine> transactions, int totalCount) {
        String title = escape(stat.titleEn());
        long avg = stat.sold() > 0 ? stat.revenueUsdCents() / stat.sold() : 0;
        int pct = stat.capacity() > 0 ? (int) Math.round(100.0 * stat.sold() / stat.capacity()) : 0;

        StringBuilder sb = new StringBuilder("📊 <b>").append(title).append("</b>\n").append(DIVIDER).append('\n');
        sb.append(bar(pct)).append("  ").append(pct).append("%\n");
        sb.append("🎟 Sold: <b>").append(stat.sold()).append('/').append(stat.capacity()).append("</b>\n");
        sb.append("💰 Revenue: <b>").append(usd(stat.revenueUsdCents())).append("</b>")
          .append("  ·  avg ").append(usd(avg)).append("/ticket\n");

        if (transactions.isEmpty()) {
            sb.append(DIVIDER).append("\nNo transactions yet.");
            return sb.toString();
        }

        sb.append(DIVIDER).append("\n<b>🧾 Recent transactions</b>\n");
        int i = 0;
        for (TransactionLine t : transactions) {
            i++;
            sb.append("\n<b>").append(i).append(".</b> <code>").append(escape(t.bookingRef())).append("</code>\n");
            if (t.buyerName() != null && !t.buyerName().isBlank()) {
                sb.append("   👤 ").append(escape(t.buyerName())).append('\n');
            }
            if (t.buyerPhone() != null && !t.buyerPhone().isBlank()) {
                sb.append("   📞 ").append(escape(t.buyerPhone())).append('\n');
            }
            sb.append("   💳 ").append(escape(t.provider() == null ? "—" : t.provider()))
              .append("  ").append(stateEmoji(t.state())).append(' ').append(escape(t.state()))
              .append("  ·  ").append(usd(t.amountUsdCents())).append('\n');
            sb.append("   🕒 ").append(at(t.createdAt())).append('\n');
        }
        if (totalCount > transactions.size()) {
            sb.append("\n<i>…and ").append(totalCount - transactions.size()).append(" more.</i>");
        }
        return sb.toString();
    }

    /** One organiser's event, as far as {@link #eventStatsMessage} needs to know it. */
    public record EventStat(String titleEn, int sold, int capacity, long revenueUsdCents) {}

    /** One booking row, as far as {@link #eventStatsMessage} needs to know it. */
    public record TransactionLine(
            String bookingRef, String buyerName, String buyerPhone,
            String provider, String state, long amountUsdCents, Instant createdAt) {}

    /**
     * Capacity and the price range, across both halves of the inventory split.
     *
     * <p>Zones alone would under-report a SEATED or MIXED event by its entire
     * seat map - the same trap EventMapper's comment describes - so both are
     * folded in. An event with neither is worth flagging rather than hiding:
     * the server refuses to submit one, so its absence here would mean
     * something has gone wrong upstream.
     */
    private static void appendInventory(StringBuilder sb, Event event) {
        int capacity = 0;
        long min = Long.MAX_VALUE;
        long max = Long.MIN_VALUE;

        for (var z : event.getZones()) {
            capacity += z.getCapacity() == null ? 0 : z.getCapacity();
            if (z.getPriceUsdCents() != null) {
                min = Math.min(min, z.getPriceUsdCents());
                max = Math.max(max, z.getPriceUsdCents());
            }
        }
        for (var c : event.getSeatClasses()) {
            if (c.getPriceUsdCents() != null) {
                min = Math.min(min, c.getPriceUsdCents());
                max = Math.max(max, c.getPriceUsdCents());
            }
        }

        if (capacity > 0) {
            sb.append("Capacity: ").append(String.format(Locale.ENGLISH, "%,d", capacity)).append('\n');
        }
        if (min != Long.MAX_VALUE) {
            sb.append("Price: ").append(usd(min));
            if (max != min) sb.append(" – ").append(usd(max));
            sb.append('\n');
        }
    }

    /**
     * An organiser wants to be paid, and somebody has to move money.
     *
     * <p>The invoice's own lines rather than only the total, because the
     * decision an admin is about to make is whether the total is right - and
     * checking that from a phone means seeing what it was derived from. The
     * reference an admin will need after transferring is the invoice number,
     * so it leads.
     *
     * <p>English only, like every other message in this file - see the note on
     * {@link #organizerApplication}.
     */
    public static String payoutRequested(PayoutRequest payout,
                                         String eventTitleEn,
                                         String organizerName) {
        StringBuilder sb = new StringBuilder("\uD83D\uDCB0 <b>Payout requested</b>\n\n");

        sb.append("<b>").append(escape(payout.getInvoiceNo())).append("</b>\n");
        if (eventTitleEn != null) {
            sb.append("\uD83C\uDFAB ").append(escape(eventTitleEn)).append('\n');
        }
        sb.append('\n');

        line(sb, "Organiser", organizerName);
        sb.append("Tickets: ").append(payout.getTicketsSold())
          .append(" across ").append(payout.getBookingsCount()).append(" bookings\n");

        sb.append(DIVIDER).append('\n');
        sb.append("Gross: ").append(usd(payout.getGrossUsdCents())).append('\n');
        sb.append("Platform fee (").append(pct(payout.getFeeBps())).append("): −")
          .append(usd(payout.getFeeUsdCents())).append('\n');
        sb.append("<b>Payable: ").append(usd(payout.getNetUsdCents())).append("</b>\n");
        sb.append(DIVIDER).append('\n');

        line(sb, "Send to", payout.getPayoutMethod() + " · " + payout.getAccountName());
        line(sb, "Account", payout.getAccountNumber());
        sb.append("Requested: ").append(at(payout.getRequestedAt())).append(" (Phnom Penh)\n");

        if (payout.getNote() != null && !payout.getNote().isBlank()) {
            sb.append("\n<i>").append(escape(payout.getNote())).append("</i>\n");
        }

        sb.append("\nDecide it under <b>Payouts</b> in the admin console.");
        return sb.toString();
    }

    /**
     * The transfer was made - the organiser's side of the same row.
     *
     * <p>Carries the reference, because that is what they will quote at their
     * bank when the money has not appeared. A "you have been paid" with nothing
     * to look up is the message that generates the support conversation rather
     * than preventing it.
     */
    public static String payoutPaid(PayoutRequest payout, String eventTitleEn) {
        StringBuilder sb = new StringBuilder("\u2705 <b>You have been paid</b>\n" + DIVIDER + "\n");
        if (eventTitleEn != null) {
            sb.append("\uD83C\uDFAB <b>").append(escape(eventTitleEn)).append("</b>\n");
        }
        sb.append('\n');
        sb.append("\uD83D\uDCB5 <b>").append(usd(payout.getNetUsdCents())).append("</b> sent to ")
          .append(escape(payout.getPayoutMethod())).append('\n');
        line(sb, "Reference", payout.getPaidReference());
        line(sb, "Invoice", payout.getInvoiceNo());
        sb.append("\nKeep the reference — it is what your bank will ask for.");
        return sb.toString();
    }

    /** Basis points as a percentage a person reads: 1000 becomes "10%", 250 "2.5%". */
    private static String pct(int bps) {
        if (bps % 100 == 0) return (bps / 100) + "%";
        return String.format(Locale.ENGLISH, "%.2f%%", bps / 100.0).replaceAll("0+%$", "%");
    }

    /** Cents to dollars. The API speaks cents; nothing a person reads should. */
    private static String usd(long cents) {
        return String.format(Locale.ENGLISH, "$%,.2f", cents / 100.0);
    }
}
