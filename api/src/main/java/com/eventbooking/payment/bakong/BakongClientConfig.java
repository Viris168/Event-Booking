package com.eventbooking.payment.bakong;

import com.eventbooking.payment.PaymentProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Chooses which {@link BakongClient} the lane gets.
 *
 * <p>One bean, one property. Everything downstream - the reconciler, the
 * service, the controller - is written against the interface and cannot tell
 * the difference, so the day credentials arrive the change is
 * {@code BAKONG_MODE=LIVE} and nothing else.
 */
@Configuration
public class BakongClientConfig {

    private static final Logger log = LoggerFactory.getLogger(BakongClientConfig.class);

    @Bean
    public BakongClient bakongClient(PaymentProperties properties) {
        PaymentProperties.Bakong config = properties.bakong();

        if (config.mode() == PaymentProperties.BakongMode.MOCK) {
            log.warn("Bakong is in MOCK mode - QR codes are real but nothing is ever charged. "
                    + "Set BAKONG_MODE=LIVE with a bearer token for the real API.");
            return new MockBakongClient();
        }

        if (config.bearerToken() == null || config.bearerToken().isBlank()) {
            // Failing at startup beats failing on a customer's first scan: in
            // LIVE mode a missing token means every poll comes back 401 and no
            // booking ever confirms, which looks like a silent hang.
            throw new IllegalStateException(
                    "app.payment.bakong.bearer-token (BAKONG_BEARER_TOKEN) is required when BAKONG_MODE=LIVE.");
        }

        // Timeouts are short and explicit. The reconciler settles a batch of
        // attempts one after another on a scheduled thread; a socket with no
        // read timeout would stall every attempt behind it, and the customers
        // waiting on those would watch a spinner until their QR expired.
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(config.connectTimeout());
        requestFactory.setReadTimeout(config.readTimeout());

        RestClient restClient = RestClient.builder()
                .baseUrl(config.baseUrl())
                .requestFactory(requestFactory)
                .defaultHeader("Authorization", "Bearer " + config.bearerToken())
                .build();

        log.info("Bakong client is LIVE against {}", config.baseUrl());
        return new BakongApiClient(restClient);
    }
}
