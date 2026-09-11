package com.eventbooking.security;

import com.eventbooking.model.AppUser;
import com.eventbooking.repository.AppUserRepository;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

/**
 * Teaches Spring Security how to find a user in {@code app_user}.
 *
 * <p>Spring Security has never heard of {@link AppUser}; it only understands its
 * own {@link UserDetails} interface. This class is the adapter between the two:
 * given a login identifier it loads our row and restates it as an
 * {@link AppUserPrincipal}.
 *
 * <p>The "username" here is {@code phone_e164}, because that is what people log
 * in with in this product and what {@link JwtService} puts in the token subject.
 * Email is optional on the table and cannot serve as the identifier.
 *
 * <p>Returns {@link AppUserPrincipal} rather than Spring's stock {@code User} so
 * the numeric {@code app_user.id} survives into the controllers. That is the
 * whole reason {@code X-User-Id} could be deleted: the id now comes from a
 * verified token instead of a header the caller types.
 */
@Service
public class AppUserDetailsService implements UserDetailsService {

    private final AppUserRepository appUserRepository;

    public AppUserDetailsService(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    @Override
    public AppUserPrincipal loadUserByUsername(String phoneE164) throws UsernameNotFoundException {
        AppUser user = appUserRepository.findByPhoneE164(phoneE164)
                .orElseThrow(() -> new UsernameNotFoundException("No user for " + phoneE164));

        return AppUserPrincipal.of(user);
    }
}
