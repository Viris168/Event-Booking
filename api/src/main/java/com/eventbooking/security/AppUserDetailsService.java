package com.eventbooking.security;

import com.eventbooking.model.AppUser;
import com.eventbooking.repository.AppUserRepository;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Teaches Spring Security how to find a user in {@code app_user}.
 *
 * <p>Spring Security has never heard of {@link AppUser}; it only understands its
 * own {@link UserDetails} interface. This class is the adapter between the two:
 * given a login identifier it loads our row and restates it in the framework's
 * vocabulary. Without it, Boot falls back to an in-memory user with a password
 * printed at startup - which is what this application has been doing so far.
 *
 * <p>The "username" here is {@code phone_e164}, because that is what people log
 * in with in this product. Email is optional on the table and cannot serve as
 * the identifier.
 */
@Service
public class AppUserDetailsService implements UserDetailsService {

    private final AppUserRepository appUserRepository;

    public AppUserDetailsService(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String phoneE164) throws UsernameNotFoundException {
        AppUser user = appUserRepository.findByPhoneE164(phoneE164)
                .orElseThrow(() -> new UsernameNotFoundException("No user for " + phoneE164));

        // GOOGLE accounts have no password_hash - it is nullable since V9. They
        // never authenticate through this path, so hand Spring an empty string
        // rather than null: null trips User.withUsername's own validation, while
        // "" is simply a hash no submitted password can ever match.
        String passwordHash = user.getPasswordHash() != null ? user.getPasswordHash() : "";

        // Spring's convention is that an authority backing a role is the role
        // name prefixed with ROLE_. hasRole("ORGANIZER") re-adds that prefix
        // internally, so storing the bare name here would silently never match.
        List<SimpleGrantedAuthority> authorities =
                List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()));

        return User.withUsername(user.getPhoneE164())
                .password(passwordHash)
                .authorities(authorities)
                // is_disabled is our kill switch for an account; disabled(true)
                // makes Spring reject the login before any password is compared.
                .disabled(Boolean.TRUE.equals(user.getIsDisabled()))
                .build();
    }
}
