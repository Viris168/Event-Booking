package com.eventbooking.security;

import com.eventbooking.Enumeration.Role;
import com.eventbooking.model.AppUser;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.security.error.NotAnAdminException;
import org.springframework.stereotype.Component;

/**
 * The moderation counterpart to {@link OrganizerResolver}: turns a caller's
 * identity into "yes, this is a platform admin" or a 403.
 *
 * <p>This is a real authorization check, not a stand-in for one. What is
 * temporary is only where {@code actorUserId} comes from - the
 * {@code X-User-Id} header today, the JWT subject once authentication lands.
 * The rule itself does not change, so there is nothing here to delete later;
 * the swap happens in the controller signature and stops there.
 *
 * <p>Unlike the organiser check, which infers the role from the existence of an
 * {@code organizer_profile} row, admin has no such table and must read
 * {@code app_user.role} directly. That is the only reason this reads a role
 * column at all.
 */
@Component
public class AdminResolver {

    private final AppUserRepository appUserRepository;

    public AdminResolver(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    /**
     * Authorize the caller as a platform admin and return their
     * {@code app_user.id} for the audit trail.
     *
     * <p>The id is returned rather than a void check because every moderation
     * action writes an {@code event_review} row naming who decided, and making
     * the caller fetch that separately is how an audit log ends up with the
     * wrong actor in it.
     *
     * <p>A disabled account is refused: {@code is_disabled} is how an admin is
     * revoked, and a revoked admin that can still approve events would make the
     * flag decorative.
     */
    public Long requireAdminUserId(Long actorUserId) {
        AppUser user = appUserRepository.findById(actorUserId)
                .orElseThrow(() -> new NotAnAdminException(actorUserId));

        if (user.getRole() != Role.PLATFORM_ADMIN || Boolean.TRUE.equals(user.getIsDisabled())) {
            throw new NotAnAdminException(actorUserId);
        }
        return user.getId();
    }
}
