package com.eventbooking.security;

import com.eventbooking.security.error.TooManyLoginAttemptsException;
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
 * Makes guessing passwords expensive.
 *
 * <p>Without this, /auth/login answers as fast as BCrypt can run - about ten
 * guesses a second per connection, all day, with nothing to stop it but the
 * attacker's patience. That is survivable only while every password is strong,
 * which is not a property this service can enforce on its users.
 *
 * <h2>Two counters, because one attack is not the other</h2>
 * <ul>
 *   <li><b>Per account.</b> Someone working through a password list against one
 *       phone number. Tight limit - a person who has forgotten their password
 *       does not need twenty tries.</li>
 *   <li><b>Per address.</b> Someone spraying one common password across many
 *       numbers, which never trips a per-account limit because no single
 *       account sees more than one failure. Looser, because an office or a
 *       phone network puts many legitimate users behind one address.</li>
 * </ul>
 *
 * <p><b>Only failures count.</b> A successful sign-in is not an attack, so it
 * is never counted, and it clears that account's counter outright - the user
 * proved they own it. It does NOT clear the address counter: an attacker with
 * one valid account of their own could otherwise reset the spray limit at will.
 *
 * <p><b>Refused before the password is checked</b>, so a blocked attempt costs
 * a map lookup rather than a BCrypt hash. Under a flood that difference is the
 * one keeping the CPU free to serve everyone else.
 *
 * <h2>What this is not</h2>
 * <p>In-memory and per-instance. Restarting the API forgets every counter, and
 * a second instance behind a load balancer keeps its own. For one container it
 * is the right size; the moment this runs as two, the counters belong in Redis
 * or in front of the app at the proxy.
 */
@Component
public class LoginRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(LoginRateLimiter.class);

    /**
     * A fixed window: when it started, and how many failures have landed in it.
     *
     * <p>Immutable so {@link ConcurrentHashMap#compute} can swap it atomically -
     * read-modify-write on a shared counter is exactly the race that lets two
     * simultaneous attempts both read "4 of 5" and both proceed.
     */
    private record Window(Instant startedAt, int failures) {
        boolean isLive(Instant now, Duration length) {
            return startedAt.plus(length).isAfter(now);
        }
    }

    private final Map<String, Window> byAccount = new ConcurrentHashMap<>();
    private final Map<String, Window> byAddress = new ConcurrentHashMap<>();

    private final int accountLimit;
    private final Duration accountWindow;
    private final int addressLimit;
    private final Duration addressWindow;

    public LoginRateLimiter(
            @Value("${app.auth.login-rate-limit.per-account.max-failures}") int accountLimit,
            @Value("${app.auth.login-rate-limit.per-account.window}") Duration accountWindow,
            @Value("${app.auth.login-rate-limit.per-address.max-failures}") int addressLimit,
            @Value("${app.auth.login-rate-limit.per-address.window}") Duration addressWindow) {
        this.accountLimit = accountLimit;
        this.accountWindow = accountWindow;
        this.addressLimit = addressLimit;
        this.addressWindow = addressWindow;
    }

    /**
     * Throws if this attempt should not be allowed to reach the password check.
     *
     * @throws TooManyLoginAttemptsException carrying the seconds until the
     *         offending window rolls over
     */
    public void check(String address, String phoneE164) {
        Instant now = Instant.now();
        blockIfOver(byAccount.get(phoneE164), now, accountWindow, accountLimit);
        blockIfOver(byAddress.get(address), now, addressWindow, addressLimit);
    }

    /** One wrong password. Counted against both keys. */
    public void recordFailure(String address, String phoneE164) {
        Instant now = Instant.now();
        Window account = bump(byAccount, phoneE164, now, accountWindow);
        bump(byAddress, address, now, addressWindow);

        if (account.failures() == accountLimit) {
            // At the threshold, not past it: logged once per lockout rather
            // than on every attempt that follows.
            log.warn("Login attempts for {} exhausted after {} failures; refusing for {}",
                    phoneE164, accountLimit, accountWindow);
        }
    }

    /**
     * A real sign-in. Clears this account's counter so a user who fumbled their
     * password four times is not punished for the next fifteen minutes.
     */
    public void recordSuccess(String phoneE164) {
        byAccount.remove(phoneE164);
    }

    private void blockIfOver(Window window, Instant now, Duration length, int limit) {
        if (window == null || !window.isLive(now, length) || window.failures() < limit) {
            return;
        }
        throw new TooManyLoginAttemptsException(
                Duration.between(now, window.startedAt().plus(length)).toSeconds() + 1);
    }

    private Window bump(Map<String, Window> counters, String key, Instant now, Duration length) {
        return counters.compute(key, (ignored, current) ->
                current != null && current.isLive(now, length)
                        ? new Window(current.startedAt(), current.failures() + 1)
                        : new Window(now, 1));
    }

    /**
     * Drops windows that have rolled over.
     *
     * <p>Nothing else removes them, and the keys are attacker-supplied - a
     * spray across ten thousand invented phone numbers would otherwise be a way
     * to grow the heap until the JVM gives up.
     */
    @Scheduled(fixedDelayString = "${app.auth.login-rate-limit.sweep-interval-ms:300000}")
    void sweepExpired() {
        Instant now = Instant.now();
        byAccount.values().removeIf(w -> !w.isLive(now, accountWindow));
        byAddress.values().removeIf(w -> !w.isLive(now, addressWindow));
    }
}
