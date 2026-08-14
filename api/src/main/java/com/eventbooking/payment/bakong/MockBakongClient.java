package com.eventbooking.payment.bakong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A Bakong stand-in for anyone without merchant credentials - which is
 * everyone on this project until NBC issues them.
 *
 * <p>It answers NOT_FOUND for every QR, exactly as the real API does while a
 * customer is still deciding, until something calls {@link #settle} - that is
 * the moment the money "arrives". {@code PaymentSimulationController} exposes
 * it over HTTP so the whole flow can be driven from Swagger or from the web's
 * pay screen.
 *
 * <p>The QR strings it settles are real: {@code KhqrGenerator} is not mocked,
 * so what the web renders here is a genuine, scannable, correctly-checksummed
 * KHQR. Only the "did it get paid" answer is faked, which keeps the switch to
 * LIVE down to one property.
 */
public class MockBakongClient implements BakongClient {

    private static final Logger log = LoggerFactory.getLogger(MockBakongClient.class);

    /** md5 -> the answer to give from now on. Absent means "not paid yet". */
    private final Map<String, BakongCheckResult> settled = new ConcurrentHashMap<>();

    @Override
    public BakongCheckResult checkByMd5(String md5) {
        BakongCheckResult result = settled.get(md5);
        if (result != null) {
            return result;
        }
        return BakongCheckResult.notFound("MOCK: no transaction for this QR yet");
    }

    /**
     * Marks a QR paid. Idempotent, and deliberately so: the reconciler is
     * allowed to ask as often as it likes and must get the same answer every
     * time, which is precisely the property the real integration depends on.
     *
     * @return the hash the mock will report as the settled transaction
     */
    public String settle(String md5) {
        BakongCheckResult existing = settled.get(md5);
        if (existing != null) {
            return existing.transactionHash();
        }
        String hash = "MOCK" + Integer.toHexString(md5.hashCode()).toUpperCase();
        settled.put(md5, BakongCheckResult.paid(hash, "MOCK: payment received"));
        log.info("MOCK Bakong: md5 {} is now paid (hash {})", md5, hash);
        return hash;
    }

    /** Everything settled so far - handy when a test needs to assert on it. */
    public Set<String> settledMd5s() {
        return Set.copyOf(settled.keySet());
    }

    public void reset() {
        settled.clear();
    }
}
