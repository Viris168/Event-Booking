package com.eventbooking.config;

import com.eventbooking.security.JwtAuthenticationFilter;
import com.eventbooking.security.RestAuthenticationEntryPoint;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Who may call what.
 *
 * <p><b>Deny by default.</b> The last rule is {@code anyRequest().authenticated()},
 * so anything not named above it needs a token. That ordering is the whole
 * design: a new endpoint added next month is private until someone deliberately
 * makes it public, rather than public until someone notices. The previous
 * version of this file ended in {@code anyRequest().permitAll()}, which meant
 * every write in the application - approving an event, generating seat
 * inventory, deactivating a zone - was reachable by anyone who knew the URL,
 * with the caller's identity taken from an {@code X-User-Id} header they typed
 * themselves.
 *
 * <p><b>What stays public, and why.</b> Reading the catalogue: events, zones,
 * seat classes, seat maps, availability, venues, provinces. None of it is
 * private - it is what is on sale - and requiring a token to browse would mean
 * nobody could decide to buy without an account. Everything that names a person
 * (holds, bookings, tickets, check-ins, organiser dashboards, moderation) is
 * authenticated, including the GETs.
 *
 * <p><b>Why the public list is enumerated rather than pattern-matched.</b> A
 * tempting shortcut is "permit all GETs under /api/v1/events/**". It is wrong:
 * {@code GET /api/v1/events/{id}/holds/{holdId}} and
 * {@code GET /api/v1/events/{id}/check-in-stats} both live under that prefix and
 * both belong to a specific person. Matching on shape rather than on meaning is
 * how a rule quietly grants more than it reads like it does.
 *
 * <p>CSRF is off and sessions are stateless because this is a token API serving
 * a separate SPA origin: credentials travel in an {@code Authorization} header
 * the browser does not attach automatically, so there is no ambient cookie for a
 * cross-site request to ride on - which is the thing CSRF protection defends.
 */
@Configuration
public class SecurityConfig {

    /**
     * Readable without signing in. Every entry is a catalogue read; see the
     * class note for why this is a list and not a wildcard.
     */
    private static final String[] PUBLIC_GETS = {
            "/api/v1/health",
            "/api/v1/province",
            "/api/v1/events",
            "/api/v1/events/{id}",
            "/api/v1/events/{id}/verify",
            "/api/v1/events/{id}/zone",
            "/api/v1/events/{id}/seat-map",
            "/api/v1/events/{id}/seat-class",
            "/api/v1/events/{id}/seat-class/{seatClassId}",
            "/api/v1/events/{id}/seats/availability",
            "/api/v1/events/{id}/availability",
            "/api/v1/zone/{id}",
            "/api/v1/zone/{id}/availability",
            "/api/v1/venue",
            "/api/v1/venue/{id}",
            "/api/v1/venue/{id}/seats",
    };

    /**
     * The API description and the page that renders it. Harmless on a laptop and
     * a free map of the attack surface on a public host, so it is worth turning
     * off there - hence the switch rather than a hardcoded permit.
     */
    private static final String[] DOCS = {
            "/swagger-ui.html",
            "/swagger-ui/**",
            "/v3/api-docs",
            "/v3/api-docs/**",
    };

    private final List<String> allowedOrigins;
    private final boolean docsPublic;
    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final RestAuthenticationEntryPoint authenticationEntryPoint;

    public SecurityConfig(@Value("${app.cors.allowed-origins}") List<String> allowedOrigins,
                          @Value("${app.docs.public:false}") boolean docsPublic,
                          JwtAuthenticationFilter jwtAuthenticationFilter,
                          RestAuthenticationEntryPoint authenticationEntryPoint) {
        this.allowedOrigins = allowedOrigins;
        this.docsPublic = docsPublic;
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.authenticationEntryPoint = authenticationEntryPoint;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

                .authorizeHttpRequests(auth -> {
                    // Sign-in itself cannot require being signed in. /auth/me is
                    // deliberately NOT in here - it is the one endpoint under
                    // /auth that answers a question only a token can pose.
                    auth.requestMatchers(HttpMethod.POST,
                            "/api/v1/auth/register",
                            "/api/v1/auth/login",
                            "/api/v1/auth/refresh",
                            "/api/v1/auth/logout",
                            // Sign-in itself, so it cannot require being signed
                            // in. /auth/me/phone is deliberately NOT here: it
                            // edits an account and needs the token that names it.
                            "/api/v1/auth/google").permitAll();

                    // The browser sends a credential-less OPTIONS before any
                    // cross-origin request with an Authorization header. Rejecting
                    // it means the real request is never sent, and the failure
                    // surfaces as an opaque CORS error rather than a 401.
                    auth.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll();

                    auth.requestMatchers(HttpMethod.GET, PUBLIC_GETS).permitAll();

                    // The ABA PayWay return page. The gateway redirects the
                    // customer's browser here after approval, carrying no token
                    // of ours - it never had one.
                    auth.requestMatchers(HttpMethod.GET, "/checkout").permitAll();

                    // Liveness and the scrape endpoint. /actuator/metrics and
                    // anything Boot adds later are NOT listed, so they fall
                    // through to authenticated() below - an actuator endpoint
                    // should have to be named to be exposed.
                    auth.requestMatchers(HttpMethod.GET,
                            "/actuator/health",
                            "/actuator/health/**",
                            "/actuator/prometheus").permitAll();

                    if (docsPublic) {
                        auth.requestMatchers(DOCS).permitAll();
                    }

                    /*
                     * Role gates by path prefix.
                     *
                     * Every admin endpoint already calls AdminResolver, and
                     * every organiser endpoint calls OrganizerResolver, so
                     * these rules refuse nobody who is not refused today. What
                     * they add is that the guarantee stops depending on each
                     * new method remembering the call: the prefix is closed,
                     * and an endpoint added here tomorrow is admin-only before
                     * anyone writes a line of its body.
                     *
                     * PLATFORM_ADMIN is allowed through the organiser prefix
                     * because the client grants admins organiser access;
                     * OrganizerResolver still decides whether they actually own
                     * the row, so this widens reachability, not authority.
                     *
                     * The trailing slash matters. /api/v1/organizer/** does not
                     * match /api/v1/organizer-applications, which is the path a
                     * CUSTOMER uses to apply to become an organiser - gating it
                     * here would lock everyone out of the only door into the
                     * role.
                     *
                     * The resolvers stay. This chain answers "what are you";
                     * they answer "is this row yours" and hand back the
                     * app_user id an event_review row has to name.
                     */
                    auth.requestMatchers("/api/v1/admin/**").hasRole("PLATFORM_ADMIN");
                    auth.requestMatchers("/api/v1/organizer/**")
                            .hasAnyRole("ORGANIZER", "PLATFORM_ADMIN");

                    auth.anyRequest().authenticated();
                })

                // Without this, an unauthenticated call to a protected endpoint
                // returns Spring's own 403 HTML page. The client cannot tell that
                // from a genuine permission failure, so it never knows to refresh
                // its token - it just reports "forbidden" and stops.
                .exceptionHandling(ex -> ex.authenticationEntryPoint(authenticationEntryPoint))

                // Ahead of UsernamePasswordAuthenticationFilter, which is where form
                // login would sit. That slot has no meaning for a token API, but it
                // is the conventional anchor point and guarantees the context is
                // populated before any authorization rule is evaluated.
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * How passwords are hashed and checked. BCrypt generates its own random salt
     * per password and stores it inside the resulting hash, so two users who
     * pick the same password still end up with different values in
     * {@code app_user.password_hash} - a stolen dump cannot be cracked in bulk
     * by hashing a candidate once and comparing it against every row.
     *
     * <p>It is also deliberately slow. That costs a few milliseconds on a real
     * login and makes brute-forcing the whole table impractical.
     *
     * <p>Never store a password itself. Registration calls {@code encode()};
     * login calls {@code matches(raw, storedHash)}. There is no decode step.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * Lets the SPA call the API from its own origin. The list comes from
     * {@code app.cors.allowed-origins}, which must name the real frontend origin
     * in any deployment - the default is the Vite dev server.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(allowedOrigins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        // Tokens travel in the Authorization header, which the client sets
        // explicitly - no cookie is involved, so credentialed CORS buys nothing
        // and would force every allowed origin to be named exactly anyway.
        config.setAllowCredentials(false);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
