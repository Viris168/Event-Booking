package com.eventbooking.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

/**
 * The Swagger UI's front page, at {@code /swagger-ui.html}.
 *
 * <p>The description doubles as the runbook for anyone opening the docs to try
 * the payment flow, because the one thing the generated spec cannot say is
 * which order to call things in.
 */
@Configuration
public class OpenApiConfig {

    private static final String BEARER = "bearerAuth";

    @Bean
    public OpenAPI eventBookingOpenApi(@Value("${server.port:8080}") int port) {
        return new OpenAPI()
                // Registers the Authorize button. Without a declared scheme
                // Swagger UI has nowhere to put a token, which makes every
                // protected endpoint untestable from the docs page.
                .components(new Components().addSecuritySchemes(BEARER, new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")
                        .description("The `access_token` from `POST /api/v1/auth/login`.")))
                // Applied globally, then relaxed per endpoint by springdoc where
                // a handler is public. Declaring it the other way round - opt in
                // per endpoint - repeats the mistake the old security rules made:
                // the safe state should be the one you get by saying nothing.
                .addSecurityItem(new SecurityRequirement().addList(BEARER))
                .servers(List.of(new Server().url("http://localhost:" + port).description("Local")))
                .info(new Info()
                        .title("Event Booking API")
                        .version("0.0.1-SNAPSHOT")
                        .description("""
                                Ticketing for Cambodia: venues, events, seat and zone inventory,
                                holds, bookings, and Bakong KHQR payments.

                                ### Authentication
                                Browsing the catalogue is public. Everything else needs a
                                bearer token:

                                1. `POST /api/v1/auth/login` with `phone_e164` and `password`.
                                2. Paste `access_token` into **Authorize** above.
                                3. `GET /api/v1/auth/me` to confirm who you are.

                                The token lasts 15 minutes; `POST /api/v1/auth/refresh` trades
                                the refresh token for a new pair and burns the old one.

                                ### Trying the payment flow
                                Bakong runs in MOCK mode unless `BAKONG_MODE=LIVE`, so no
                                merchant account is needed. The QR strings are real and
                                scannable - only the "has it been paid" answer is simulated.

                                1. `POST /api/v1/bookings/{id}/payments` with
                                   `{"provider":"BAKONG_KHQR"}` - returns `qrPayload`, the
                                   KHQR string. Call it twice: you get the same attempt back.
                                2. `GET /api/v1/payments/{id}` - what a pay screen polls.
                                3. `POST /api/v1/dev/payments/{id}/pay` - the customer pays.
                                   Only exists under the `dev` profile.
                                   The booking should read CONFIRMED. Call it again; nothing
                                   should change, which is the point of the whole design.
                                4. `POST /api/v1/dev/payments/{id}/expire` - the other ending:
                                   attempt EXPIRED, booking back to PAYMENT_FAILED, seats
                                   still held, free to start a new QR.

                                Bookings themselves have no endpoints yet, so seed one
                                through the service layer or by hand before step 1.
                                """));
    }
}
