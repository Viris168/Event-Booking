package com.eventbooking.controller;

import com.eventbooking.dto.auth.LoginRequest;
import com.eventbooking.dto.auth.RegisterRequest;
import com.eventbooking.dto.auth.TokenResponse;
import com.eventbooking.security.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.annotation.JsonProperty;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Auth", description = "Registration, sign-in, and token lifecycle")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    @Operation(
            summary = "Create a LOCAL account and sign in",
            description = """
                    Phone is the account identifier, not email - email is optional here
                    because `app_user.email` is nullable.

                    Returns a token pair immediately, so a new user is not asked for the
                    password they just chose. `409` if the phone or email is already taken.""")
    public ResponseEntity<TokenResponse> register(@Valid @RequestBody RegisterRequest request,
                                                  HttpServletRequest http) {
        TokenResponse tokens = authService.register(request, http.getHeader("User-Agent"));
        return ResponseEntity.status(HttpStatus.CREATED).body(tokens);
    }

    @PostMapping("/login")
    @Operation(
            summary = "Exchange phone + password for a token pair",
            description = """
                    `401` for an unknown phone and for a wrong password alike, with the same
                    message - a difference between the two would let anyone discover which
                    numbers hold an account.

                    Put `access_token` in the **Authorize** box above to call protected
                    endpoints. It lasts 15 minutes; `refresh_token` lasts 14 days.""")
    public TokenResponse login(@Valid @RequestBody LoginRequest request,
                               HttpServletRequest http) {
        return authService.login(request, http.getHeader("User-Agent"));
    }

    @PostMapping("/refresh")
    @Operation(
            summary = "Trade a refresh token for a new pair",
            description = """
                    The old refresh token is **revoked** in the process - each one works
                    exactly once. A token that has already been used, revoked or expired
                    all return the same `401`.

                    The access token is not sent here; it has usually expired, which is why
                    the client is calling this at all.""")
    public TokenResponse refresh(@Valid @RequestBody RefreshRequest request,
                                 HttpServletRequest http) {
        return authService.refresh(request.refreshToken(), http.getHeader("User-Agent"));
    }

    @PostMapping("/logout")
    @Operation(
            summary = "End this session",
            description = """
                    Revokes the refresh token. Always `204`, even for a token that was
                    already gone - logging out twice is not an error, and a `404` would
                    confirm which tokens exist.

                    The access token keeps working until it expires, up to 15 more minutes.
                    That is the cost of not storing access tokens server-side.""")
    public ResponseEntity<Void> logout(@Valid @RequestBody RefreshRequest request) {
        authService.logout(request.refreshToken());
        return ResponseEntity.noContent().build();
    }

    /** Shared by refresh and logout - both identify a session by its refresh token. */
    public record RefreshRequest(
            @NotBlank @JsonProperty("refresh_token") String refreshToken) {
    }
}
