package com.eventbooking.repository;

import com.eventbooking.Enumeration.Provider;
import com.eventbooking.Enumeration.Role;
import com.eventbooking.model.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
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

    /**
     * DatabaseSeeder: the demo organizer (V6__seed_demo_users.sql) that owns
     * the seeded venues and events.
     */
    Optional<AppUser> findFirstByRoleOrderByIdAsc(Role role);

    /**
     * Every user in a role, id order.
     *
     * <p>Added for the seeder, which used findFirstByRoleOrderByIdAsc and so
     * gave every venue and event to one organiser - leaving the other demo
     * logins on an empty dashboard, and every ownership check with nothing to
     * prove.
     */
    List<AppUser> findAllByRoleOrderByIdAsc(Role role);

    /**
     * The admin users screen, filtered server-side.
     *
     * <p>Each filter is nullable and a null one means "do not filter", which is
     * what lets one query serve the unfiltered list and every combination of
     * the three controls above it. The screen used to hold every account in the
     * browser and filter the array; that works until the platform has more
     * users than a tab wants to keep.
     *
     * <p>{@code q} arrives already lowercased and {@code %}-wrapped - the
     * service owns that, so this query has no string handling in it. phone and
     * email are coalesced because both are nullable on this table: a GOOGLE
     * account has no phone until its owner supplies one, and concatenating a
     * null in SQL would make the whole haystack null and silently drop the row.
     */
    @Query("""
            select u from AppUser u
            where (:role is null or u.role = :role)
              and (:disabled is null or u.isDisabled = :disabled)
              and (:q is null
                   or lower(u.displayName) like :q escape '!'
                   or lower(coalesce(u.phoneE164, '')) like :q escape '!'
                   or lower(coalesce(u.email, '')) like :q escape '!')
            order by u.id asc
            """)
    List<AppUser> searchForAdmin(@Param("q") String q,
                                 @Param("role") Role role,
                                 @Param("disabled") Boolean disabled);

    long countByRole(Role role);

    long countByIsDisabledTrue();
}
