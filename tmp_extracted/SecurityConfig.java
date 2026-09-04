package com.ticketing.api.config;

import com.ticketing.api.security.SessionJwtFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfig {

    private final SessionJwtFilter sessionJwtFilter;

    public SecurityConfig(SessionJwtFilter sessionJwtFilter) {
        this.sessionJwtFilter = sessionJwtFilter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable()) // stateless token API, no cookies
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/events/**").authenticated()
                .anyRequest().denyAll()
            )
            .addFilterBefore(sessionJwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
