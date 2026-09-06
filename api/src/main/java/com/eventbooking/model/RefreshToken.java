package com.eventbooking.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/**
 * One long-lived session, so a 15-minute access token does not mean logging in
 * four times an hour.
 *
 * <p>This is the half of the pair that can be <b>revoked</b>. Access tokens are
 * never stored - they are re-verified from their signature on every request,
 * which is fast but means nothing can cancel one before it expires. Keeping a
 * row per refresh token buys back that control: setting {@code revokedAt} ends
 * the session at the next refresh, which is what makes logout mean something.
 */
@Entity
@Table(name = "refresh_token")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private AppUser user;

    /**
     * SHA-256 of the token, never the token itself.
     *
     * <p>The raw value is shown to its owner once and then only ever arrives in
     * a request, so there is no reason for the database to hold something that
     * would let a reader of a leaked dump resume every open session. Lookup
     * still works because the same input always hashes to the same value - the
     * incoming token is hashed and matched against this column.
     */
    @Column(name = "token_hash", nullable = false, unique = true)
    private String tokenHash;

    @Column(name = "issued_at", nullable = false, insertable = false, updatable = false)
    private Instant issuedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    /** NULL while the session is live. Set by logout, and by rotation on refresh. */
    @Column(name = "revoked_at")
    private Instant revokedAt;

    /**
     * Recorded so an "active sessions" screen can say "Chrome on Windows"
     * rather than listing opaque ids. Never trusted for anything: the client
     * chooses this header and can say whatever it likes.
     */
    @Column(name = "user_agent")
    private String userAgent;

    /** Live means issued, not yet revoked, and not yet past its expiry. */
    public boolean isActive(Instant now) {
        return revokedAt == null && expiresAt.isAfter(now);
    }
}
