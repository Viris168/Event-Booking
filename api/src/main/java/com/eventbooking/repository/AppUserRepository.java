package com.eventbooking.repository;

import com.eventbooking.Enumeration.Provider;
import com.eventbooking.model.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * Data access for {@code app_user}.
 *
 * <p>Two callers, with different needs. The inventory and booking lanes resolve
 * the actor id they receive (today the {@code X-User-Id} header, later the JWT
 * principal) into an {@code AppUser} instance, because {@code Hold.user} is a
 * {@code @ManyToOne} and {@code HoldMapper.toHold} takes the entity rather than
 * a raw id - {@code findById} from {@link JpaRepository} covers that.
 *
 * <p>The auth lane looks users up by credential instead: {@code phone_e164} is
 * the login identifier, so {@code findByPhoneE164} is what
 * {@code UserDetailsService} will call on every authenticated request, and the
 * {@code exists*} pair guards registration against the UNIQUE constraints
 * before an insert turns into a raw 23505.
 */
public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    /**
     * Login lookup for LOCAL accounts. Phone is the account identifier in this
     * product rather than email - though since V5 it is nullable, because a
     * GOOGLE account has no phone until the user supplies one. Only local
     * signups are guaranteed to have it.
     */
    Optional<AppUser> findByPhoneE164(String phoneE164);

    /**
     * Email is optional on {@code app_user}, so this is for account recovery and
     * duplicate checks - never as the primary login path.
     */
    Optional<AppUser> findByEmail(String email);

    /**
     * Registration pre-checks. Cheaper than loading the row, and they let the
     * service return a clean validation error instead of letting Postgres raise
     * a unique-violation that has to be translated after the fact.
     */
    boolean existsByPhoneE164(String phoneE164);

    boolean existsByEmail(String email);

    /**
     * Google sign-in lookup. Matches on the provider's own subject claim
     * ({@code sub}) rather than email: the subject is stable for the life of
     * the Google account, while an email can be changed by its owner or
     * reassigned by a workspace admin - matching on it would eventually hand
     * one person's account to somebody else.
     *
     * <p>Both arguments are needed because {@code uq_provider_subject} is a
     * composite UNIQUE: a subject is only unique within its provider.
     */
    Optional<AppUser> findByProviderAndProviderSubject(Provider provider, String providerSubject);
}
