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
 * <p>The "username" here is {@code app_user.id} - Spring's name for the
 * parameter, not a description of its contents. It is whatever {@link JwtService}
 * put in the token subject, and that is the primary key.
 *
 * <p>It is deliberately NOT {@code phone_e164}, which is what people type into
 * the login form. The form is a different question: "who claims to be this
 * number, and do they know the password" is answered once, in
 * {@link AuthService#login}, against {@code findByPhoneE164}. Afterwards the
 * token names a row, and a row is best named by its key - a phone is nullable
 * (a Google account has none) and, in principle, changeable.
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

    /**
     * @param subject the access token's subject, which is {@code app_user.id}.
     *        The parameter keeps Spring Security's name; what it holds changed
     *        when the token subject moved off {@code phone_e164} - see
     *        {@link JwtService#generateAccessToken}.
     *
     *        <p>A subject that is not a number is an access token minted before
     *        that change, carrying a phone number. It is answered as "no such
     *        user" rather than allowed to escape as a NumberFormatException: the
     *        holder gets a 401, refreshes, and is issued a current token.
     */
    @Override
    public AppUserPrincipal loadUserByUsername(String subject) throws UsernameNotFoundException {
        long id;
        try {
            id = Long.parseLong(subject);
        } catch (NumberFormatException e) {
            throw new UsernameNotFoundException("Token subject is not an app_user id");
        }

        AppUser user = appUserRepository.findById(id)
                .orElseThrow(() -> new UsernameNotFoundException("No user for id " + id));

        return AppUserPrincipal.of(user);
    }
}
