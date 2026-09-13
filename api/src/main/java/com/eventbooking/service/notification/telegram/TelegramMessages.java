package com.eventbooking.service.notification.telegram;

import com.eventbooking.model.AppUser;
import com.eventbooking.model.Event;
import com.eventbooking.model.OrganizerApplication;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
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

    /** Cents to dollars. The API speaks cents; nothing a person reads should. */
    private static String usd(long cents) {
        return String.format(Locale.ENGLISH, "$%,.2f", cents / 100.0);
    }
}
