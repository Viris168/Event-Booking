package com.eventbooking.security;

import com.eventbooking.exception.contact.TooManyContactMessagesException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Keeps the one endpoint with no lock on it from becoming the one that hurts.
 *
 * <p>{@code POST /api/v1/contact} is permitted without a token, because the
 * people who most need it are the ones who cannot sign in. That decision is
 * sound and this class is its price: an unauthenticated write that inserts a
 * row with two TEXT columns in it is, left alone, a way to fill a disk from a
 * shell script.
 *
 * <h2>Why this is not {@link LoginRateLimiter}</h2>
 * <p>They look alike and mean different things. That one counts only FAILURES,
 * which is what lets it be strict: a legitimate user almost never trips it,
 * because a legitimate user's attempts succeed. There is no failure here - a
 * submission either validates or it does not, and a flood consists entirely of
 * submissions that validate perfectly well. So this counts submissions
 * outright, which means it CAN refuse somebody honest, and the limits are set
 * generously to make that rare rather than impossible.
 *
 * <p>The second difference follows from the first. A wrong password is a thing
 * the account's owner did; a contact message is a thing an address did. So the
 * keys are the network address and the reply-to address, and neither is ever
 * cleared by "success", because every submission is a success.
 *
 * <h2>Two keys, two attacks</h2>
 * <ul>
 *   <li><b>Per address.</b> A script. Tight enough to make the volume
 *       uninteresting, loose enough that a household or an office behind one
 *       NAT can all write in on the same afternoon.</li>
 *   <li><b>Per reply-to.</b> The same person submitting the same thing over and
 *       over, usually because they are not sure the first one went. Looser
 *       still - this one exists to stop duplicates, not to punish worry.</li>
 * </ul>
 *
 * <p>The reply-to counter is backed up in the database by
 * {@code ContactMessageRepository.countRecentByReplyTo}: an in-memory map
 * forgets everything on restart, and restarts are not rare enough to leave that
 * as the only line. The address counter has no such backup on purpose - the
 * schema does not store an IP, and adding a column to hold one would mean
 * retaining a personal identifier for every visitor who fills in a form, which
 * is a considerably worse trade than losing a counter on deploy.
 *
 * <h2>What this is not</h2>
 * <p>In-memory and per-instance, exactly like {@link LoginRateLimiter}: a
 * restart forgets it and a second replica keeps its own. At one container that
 * is the right size. At two, this belongs in Redis or at the proxy - and the
 * database-backed half above is what keeps the gap survivable in the meantime.
 */
@Component
public class ContactRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(ContactRateLimiter.class);

    /**
     * A fixed window: when it opened, and how many messages have landed in it.
     *
     * <p>Immutable, so {@link ConcurrentHashMap#compute} can swap it in one
     * step. Read-modify-write on a shared counter is the exact race that lets
     * two simultaneous submissions both read "2 of 3" and both proceed.
     */
    private record Window(Instant startedAt, int count) {
        boolean isLive(Instant now, Duration length) {
            return startedAt.plus(length).isAfter(now);
        }
    }

    private final Map<String, Window> byAddress = new ConcurrentHashMap<>();
    private final Map<String, Window> bySender = new ConcurrentHashMap<>();

    private final int addressLimit;
    private final Duration addressWindow;
    private final int senderLimit;
    private final Duration senderWindow;

    public ContactRateLimiter(
            @Value("${app.contact.rate-limit.per-address.max-messages}") int addressLimit,
            @Value("${app.contact.rate-limit.per-address.window}") Duration addressWindow,
            @Value("${app.contact.rate-limit.per-sender.max-messages}") int senderLimit,
            @Value("${app.contact.rate-limit.per-sender.window}") Duration senderWindow) {
        this.addressLimit = addressLimit;
        this.addressWindow = addressWindow;
        this.senderLimit = senderLimit;
        this.senderWindow = senderWindow;
    }

    /**
     * Throws if this submission should not be allowed to reach the database.
     *
     * <p>Called before the insert and before any normalisation work, so a
     * refused submission costs two map lookups rather than a transaction.
     *
     * @param address  the caller's network address
     * @param replyTo  the reply-to they gave, lower-cased by the caller
     * @throws TooManyContactMessagesException carrying the seconds until the
     *         offending window rolls over
     */
    public void check(String address, String replyTo) {
        Instant now = Instant.now();
        blockIfOver(byAddress.get(address), now, addressWindow, addressLimit);
        blockIfOver(bySender.get(replyTo), now, senderWindow, senderLimit);
    }

    /**
     * One message accepted. Counted against both keys.
     *
     * <p>Recorded after the insert succeeds, not before: a submission rejected
     * by validation or lost to a constraint never happened as far as the sender
     * is concerned, and charging them for it would mean a typo in the email
     * field costs part of their allowance.
     */
    public void recordAccepted(String address, String replyTo) {
        Instant now = Instant.now();
        Window perAddress = bump(byAddress, address, now, addressWindow);
        bump(bySender, replyTo, now, senderWindow);

        if (perAddress.count() == addressLimit) {
            // At the threshold, not past it: one line per lockout rather than
            // one per attempt that follows it.
            log.warn("Contact form allowance for {} exhausted after {} messages; refusing for {}",
                    address, addressLimit, addressWindow);
        }
    }

    /**
     * How long the sender's window still has to run, for the database-backed
     * half of the limit to report.
     *
     * <p>{@link com.eventbooking.repository.ContactMessageRepository#countRecentByReplyTo} can refuse a
     * submission this map knows nothing about - after a restart, or from a
     * different replica - and the sender is still owed a "try again in N
     * minutes". Falls back to the whole window length when there is no live
     * window here, which over-states the wait by however long ago their last
     * message was. That is the safe direction to be wrong in: it is a message
     * about when to retry, and telling somebody to wait slightly too long is
     * better than inviting them back to be refused again.
     */
    public long senderRetryAfterSeconds(String replyTo) {
        Window window = bySender.get(replyTo);
        Instant now = Instant.now();
        if (window == null || !window.isLive(now, senderWindow)) {
            return senderWindow.toSeconds();
        }
        return Duration.between(now, window.startedAt().plus(senderWindow)).toSeconds() + 1;
    }

    /** The window the database-backed check counts over. */
    public Duration senderWindow() {
        return senderWindow;
    }

    /** How many messages one reply-to may file in {@link #senderWindow()}. */
    public int senderLimit() {
        return senderLimit;
    }

    private void blockIfOver(Window window, Instant now, Duration length, int limit) {
        if (window == null || !window.isLive(now, length) || window.count() < limit) {
            return;
        }
        throw new TooManyContactMessagesException(
                Duration.between(now, window.startedAt().plus(length)).toSeconds() + 1);
    }

    private Window bump(Map<String, Window> counters, String key, Instant now, Duration length) {
        return counters.compute(key, (ignored, current) ->
                current != null && current.isLive(now, length)
                        ? new Window(current.startedAt(), current.count() + 1)
                        : new Window(now, 1));
    }

    /**
     * Drops windows that have rolled over.
     *
     * <p>Nothing else removes them and both key spaces are caller-supplied -
     * a spray from a botnet, or across ten thousand invented addresses, would
     * otherwise be a way to grow the heap until the JVM gives up. Which is the
     * denial of service this class exists to prevent, arriving through the
     * class itself.
     */
    @Scheduled(fixedDelayString = "${app.contact.rate-limit.sweep-interval-ms:300000}")
    void sweepExpired() {
        Instant now = Instant.now();
        byAddress.values().removeIf(w -> !w.isLive(now, addressWindow));
        bySender.values().removeIf(w -> !w.isLive(now, senderWindow));
    }
}
