package com.eventbooking.security;

import com.eventbooking.Enumeration.Role;
import com.eventbooking.model.AppUser;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

/**
 * The authenticated caller, carrying the one thing Spring's own
 * {@code User} cannot: our {@code app_user.id}.
 *
 * <p>This is what finally kills {@code X-User-Id}. Every service below the
 * controllers takes an actor id, and until now that id arrived in a header the
 * client typed - so {@link AdminResolver}'s "is this user an admin" check ran
 * against an id the attacker had chosen. The check was real; the input was not.
 *
 * <p>Spring's stock {@code User} only holds a username, which here is the phone
 * number. Returning that would mean every controller re-reading {@code app_user}
 * to turn a phone into an id - one query per request to recover something the
 * filter had already loaded. Carrying the id on the principal costs nothing and
 * makes {@code @AuthenticationPrincipal AppUserPrincipal actor} a drop-in
 * replacement for the header at every call site.
 *
 * <p>The password is deliberately absent. It is needed only by the login path,
 * which reads {@code app_user} directly; a principal that is rebuilt on every
 * authenticated request has no business carrying a hash around.
 */
public class AppUserPrincipal implements UserDetails {

    private final Long id;
    private final String phoneE164;
    private final Role role;
    private final boolean disabled;

    public AppUserPrincipal(Long id, String phoneE164, Role role, boolean disabled) {
        this.id = id;
        this.phoneE164 = phoneE164;
        this.role = role;
        this.disabled = disabled;
    }

    public static AppUserPrincipal of(AppUser user) {
        return new AppUserPrincipal(
                user.getId(),
                user.getPhoneE164(),
                user.getRole(),
                Boolean.TRUE.equals(user.getIsDisabled()));
    }

    /** The {@code app_user.id} every service layer method expects as its actor. */
    public Long getId() {
        return id;
    }

    public Role getRole() {
        return role;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        // Spring's convention is that an authority backing a role is the role
        // name prefixed with ROLE_. hasRole("ORGANIZER") re-adds that prefix
        // internally, so storing the bare name here would silently never match.
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }

    /** Never populated - see the class note. */
    @Override
    public String getPassword() {
        return null;
    }

    @Override
    public String getUsername() {
        return phoneE164;
    }

    @Override
    public boolean isEnabled() {
        return !disabled;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return !disabled;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }
}
