package com.eventbooking.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Opens the API up while there is no authentication to enforce.
 *
 * <p><b>Why this file exists at all.</b> spring-boot-starter-security is on the
 * classpath, and with no {@code SecurityFilterChain} bean Boot installs its own:
 * every endpoint behind HTTP Basic, with a password printed once at startup.
 * Nothing in this application ever authenticated against that - callers identify
 * themselves with an {@code X-User-Id} header - so the default was not securing
 * anything, only making the API and Swagger UI unreachable.
 *
 * <p><b>What replaces it.</b> The auth lane's JWT filter and its real rules.
 * When that lands, this chain becomes the {@code permitAll} list for the public
 * endpoints (login, register, health, the docs) and everything else moves to
 * {@code authenticated()}, with {@code X-User-Id} dropped in favour of the
 * principal. The service layer already takes an actor id per call, so nothing
 * below the controllers changes.
 *
 * <p>CSRF is off and sessions are stateless because this is a token API serving
 * a separate SPA origin: there is no cookie to forge a request with, which is
 * the thing CSRF protection defends.
 */
@Configuration
public class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    private final List<String> allowedOrigins;

    public SecurityConfig(@Value("${app.cors.allowed-origins}") List<String> allowedOrigins) {
        this.allowedOrigins = allowedOrigins;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        log.warn("Security is wide open: every endpoint permits all callers, and the actor is "
                + "read from the X-User-Id header. Replace this chain when JWT auth lands.");

        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());

        return http.build();
    }

    /**
     * Lets the Vite dev server call the API from its own origin. The list comes
     * from {@code app.cors.allowed-origins}, which has been sitting in
     * application.yml unused - this is what finally reads it.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(allowedOrigins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
