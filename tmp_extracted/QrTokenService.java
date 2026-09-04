package com.ticketing.api.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@Service
public class QrTokenService {

    private final SecretKey key;

    public QrTokenService(@Value("${app.security.qr-jwt-secret}") String secret) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public record IndividualPayload(UUID ticketId) {}
    public record GroupPayload(UUID orderId) {}

    public enum TokenType { INDIVIDUAL, GROUP }

    /** Throws JwtException / IllegalArgumentException on bad signature, expiry, or shape. */
    public TokenType peekType(String token) {
        Claims claims = parse(token);
        String type = claims.get("type", String.class);
        if (type == null) throw new IllegalArgumentException("MALFORMED_TOKEN_NO_TYPE");
        return TokenType.valueOf(type);
    }

    public IndividualPayload parseIndividual(String token) {
        Claims claims = parse(token);
        requireType(claims, TokenType.INDIVIDUAL);
        String ticketId = claims.get("ticket_id", String.class);
        if (ticketId == null) throw new IllegalArgumentException("MALFORMED_INDIVIDUAL_TOKEN");
        return new IndividualPayload(UUID.fromString(ticketId));
    }

    public GroupPayload parseGroup(String token) {
        Claims claims = parse(token);
        requireType(claims, TokenType.GROUP);
        String orderId = claims.get("order_id", String.class);
        if (orderId == null) throw new IllegalArgumentException("MALFORMED_GROUP_TOKEN");
        return new GroupPayload(UUID.fromString(orderId));
    }

    private Claims parse(String token) {
        try {
            return Jwts.parser().verifyWith(key).build()
                    .parseSignedClaims(token).getPayload();
        } catch (JwtException e) {
            throw new IllegalArgumentException("INVALID_QR_TOKEN", e);
        }
    }

    private void requireType(Claims claims, TokenType expected) {
        String type = claims.get("type", String.class);
        if (!expected.name().equals(type)) {
            throw new IllegalArgumentException("WRONG_TOKEN_TYPE_FOR_ENDPOINT");
        }
    }
}
