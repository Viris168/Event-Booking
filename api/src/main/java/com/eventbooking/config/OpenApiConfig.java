package com.eventbooking.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
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

    @Bean
    public OpenAPI eventBookingOpenApi(@Value("${server.port:8080}") int port) {
        return new OpenAPI()
                .servers(List.of(new Server().url("http://localhost:" + port).description("Local")))
                .info(new Info()
                        .title("Event Booking API")
                        .version("0.0.1-SNAPSHOT")
                        .description("""
                                Ticketing for Cambodia: venues, events, seat and zone inventory,
                                holds, bookings, and Bakong KHQR payments.

                                **Authentication is not wired up yet.** Endpoints that act on
                                behalf of a customer take an `X-User-Id` header instead of a
                                token; it becomes the JWT principal when the auth lane lands.

                                ### Trying the payment flow
                                Bakong runs in MOCK mode unless `BAKONG_MODE=LIVE`, so no
                                merchant account is needed. The QR strings are real and
                                scannable - only the "has it been paid" answer is simulated.

                                1. `POST /api/bookings/{id}/payments` with
                                   `{"provider":"BAKONG_KHQR"}` - returns `qrPayload`, the
                                   KHQR string. Call it twice: you get the same attempt back.
                                2. `GET /api/payments/{id}` - what a pay screen polls.
                                3. `POST /api/dev/payments/{id}/pay` - the customer pays.
                                   The booking should read CONFIRMED. Call it again; nothing
                                   should change, which is the point of the whole design.
                                4. `POST /api/dev/payments/{id}/expire` - the other ending:
                                   attempt EXPIRED, booking back to PAYMENT_FAILED, seats
                                   still held, free to start a new QR.

                                Bookings themselves have no endpoints yet, so seed one
                                through the service layer or by hand before step 1.
                                """));
    }
}
