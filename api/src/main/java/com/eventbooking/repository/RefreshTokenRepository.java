package com.eventbooking.repository;

import com.eventbooking.model.AppUser;
import com.eventbooking.model.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;

/**
 * Data access for {@code refresh_token}.
 *
 * <p>Every lookup is by {@code tokenHash} rather than by id: the client only
 * ever presents the raw token, and the hash of it is the only thing this side
 * has ever stored.
 */
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    /**
     * The one query refresh needs. Returns the row whether or not it is still
     * live - the caller checks {@code isActive}, because "revoked" and "no such
     * token" deserve different handling: a revoked token coming back is a
     * signal that a stolen one is being replayed, while an unknown hash is
     * usually just a stale client.
     */
    Optional<RefreshToken> findByTokenHash(String tokenHash);

    /**
     * Logout everywhere. Marks every live session for a user as revoked in one
     * statement rather than loading them into memory first.
     *
     * <p>{@code @Modifying} is required for anything that is not a SELECT, and
     * {@code clearAutomatically} drops stale copies from the persistence
     * context so a later read in the same transaction does not see the old
     * {@code revokedAt}.
     *
     * <p>{@code flushAutomatically} is not optional alongside it. Clearing
     * detaches every managed entity, so any change made earlier in the same
     * transaction and not yet written is discarded rather than persisted -
     * silently, with the transaction still committing. Changing a password and
     * revoking the sessions in one call hit exactly that: the new hash was set,
     * this query cleared the context, and the user kept their old password
     * while every token was revoked. Flushing first writes the pending change
     * before the clear can drop it.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
           update RefreshToken r
              set r.revokedAt = :now
            where r.user = :user
              and r.revokedAt is null
           """)
    int revokeAllForUser(@Param("user") AppUser user, @Param("now") Instant now);
}
