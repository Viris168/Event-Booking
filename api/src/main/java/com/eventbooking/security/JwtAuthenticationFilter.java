package com.eventbooking.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Turns a {@code Bearer} token on an incoming request into an authenticated user.
 *
 * <p>Runs once per request, before the controllers. If it finds a valid token it
 * puts the user into the {@link SecurityContextHolder}; from that point anything
 * downstream - {@code @PreAuthorize}, {@code @AuthenticationPrincipal}, the
 * service layer - sees an authenticated caller.
 *
 * <p><b>It never rejects anything.</b> No token, expired token, forged token: it
 * simply leaves the context empty and calls the next filter. Deciding what an
 * unauthenticated caller is allowed to do belongs to the rules in
 * {@code SecurityConfig}, not here. Keeping that split means this filter can be
 * added while every endpoint is still {@code permitAll} - the inventory and
 * booking lanes carry on working through {@code X-User-Id} exactly as before, and
 * only start requiring a token when the rules change in #20.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String HEADER = "Authorization";
    private static final String PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final AppUserDetailsService appUserDetailsService;

    public JwtAuthenticationFilter(JwtService jwtService,
                                   AppUserDetailsService appUserDetailsService) {
        this.jwtService = jwtService;
        this.appUserDetailsService = appUserDetailsService;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain)
            throws ServletException, IOException {

        String header = request.getHeader(HEADER);

        // No Bearer header: nothing to authenticate. Not an error - most public
        // requests look like this.
        if (header == null || !header.startsWith(PREFIX)) {
            filterChain.doFilter(request, response);
            return;
        }

        String phone = jwtService.extractPhoneOrNull(header.substring(PREFIX.length()));

        // Already authenticated earlier in the chain? Leave it alone. Re-writing
        // the context here would let a stale token override a fresher identity.
        if (phone == null || SecurityContextHolder.getContext().getAuthentication() != null) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            // The signature only proves the token was issued by us. It says
            // nothing about the account's CURRENT state, so re-read the user:
            // this is what makes disabling an account take effect immediately
            // rather than whenever the token happens to expire.
            UserDetails user = appUserDetailsService.loadUserByUsername(phone);

            if (user.isEnabled()) {
                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(
                                user, null, user.getAuthorities());
                authentication.setDetails(
                        new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            }
        } catch (UsernameNotFoundException e) {
            // Valid signature, but the user is gone - deleted since the token was
            // issued. Same outcome as no token at all.
        }

        filterChain.doFilter(request, response);
    }
}
