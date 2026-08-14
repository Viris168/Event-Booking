package com.eventbooking.payment.bakong;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.Map;

/**
 * Talks to the real Bakong Open API.
 *
 * <p>{@code POST /v1/check_transaction_by_md5} answers with HTTP 200 whatever
 * happened; the meaning is in the body's {@code responseCode}, where 0 is
 * "settled" and anything else is not. That is why the status handler below
 * swallows error statuses instead of letting RestClient throw - a 401 from an
 * expired bearer token has a readable body worth logging, and a thrown
 * exception would just look like a network blip.
 */
public class BakongApiClient implements BakongClient {

    private static final Logger log = LoggerFactory.getLogger(BakongApiClient.class);

    private static final String CHECK_PATH = "/v1/check_transaction_by_md5";
    /** Bakong's "all good" code. Every other value means the money is not in. */
    private static final int RESPONSE_OK = 0;

    private final RestClient restClient;

    public BakongApiClient(RestClient restClient) {
        this.restClient = restClient;
    }

    @Override
    public BakongCheckResult checkByMd5(String md5) {
        try {
            CheckResponse response = restClient.post()
                    .uri(CHECK_PATH)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("md5", md5))
                    // Read the body on error statuses too - see the class note.
                    .retrieve()
                    .onStatus(status -> status.isError(), (request, clientResponse) -> {
                        log.warn("Bakong answered {} for md5 {}", clientResponse.getStatusCode(), md5);
                    })
                    .body(CheckResponse.class);

            if (response == null) {
                return BakongCheckResult.unavailable("Bakong returned an empty body");
            }

            if (response.responseCode() != null && response.responseCode() == RESPONSE_OK
                    && response.data() != null) {
                return BakongCheckResult.paid(response.data().hash(), response.responseMessage());
            }

            // Everything else - "transaction could not be found", a bad token,
            // a rate limit - is simply "not paid yet" as far as the reconciler
            // is concerned. The attempt stays open until its own clock runs out,
            // so a spell of provider trouble cannot fail a customer's booking.
            return BakongCheckResult.notFound(response.responseMessage());

        } catch (RestClientException e) {
            // Network trouble, a timeout, or a body this client cannot parse.
            log.warn("Bakong check failed for md5 {}: {}", md5, e.getMessage());
            return BakongCheckResult.unavailable(e.getMessage());
        }
    }

    /**
     * Only the fields the reconciler reads. Jackson is configured to ignore the
     * rest, so Bakong adding a field cannot break the poller mid-sale.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record CheckResponse(Integer responseCode, String responseMessage, Integer errorCode, Data data) {

        @JsonIgnoreProperties(ignoreUnknown = true)
        record Data(String hash, String fromAccountId, String toAccountId,
                    String currency, Long amount, String description,
                    Long createdDateMs, Long acknowledgedDateMs, String externalRef) {
        }
    }
}
