package com.eventbooking.controller;

import com.eventbooking.dto.auth.ChangePasswordRequest;
import com.eventbooking.dto.auth.LoginRequest;
import com.eventbooking.dto.auth.MeResponse;
import com.eventbooking.dto.auth.RegisterRequest;
import com.eventbooking.dto.auth.TokenResponse;
import com.eventbooking.dto.auth.UpdateProfileRequest;
import com.eventbooking.security.AuthService;
import com.eventbooking.security.CurrentUserId;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
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

    @GetMapping("/me")
    @Operation(
            summary = "Who this access token belongs to",
            description = """
                    The only endpoint under `/auth` that requires a token. Returns the
                    caller's own record, including `role` and `organizer_profile_id` - the
                    two things a client needs to render anything and neither of which is
                    recoverable from the token, whose subject is only a phone number.

                    Do not decode the JWT client-side to read the `role` claim instead. It
                    is a snapshot from issue time, and a browser cannot verify the
                    signature that makes it trustworthy.""")
    public MeResponse me(@CurrentUserId Long actorUserId) {
        return authService.me(actorUserId);
    }

    @PatchMapping("/me")
    @Operation(
            summary = "Edit your own record",
            description = """
                    Display name, email and language. Everything else about an account is
                    deliberately absent: `phone_e164` is the login identity and the token's
                    subject, and `role` and `is_disabled` are the platform's decisions about
                    a user rather than the user's about themselves.

                    The row edited is always the one the token names - there is no id in the
                    body to point somewhere else.

                    `409 EMAIL_ALREADY_REGISTERED` if the address belongs to another account.
                    Keeping your own address is not a conflict.""")
    public MeResponse updateProfile(@CurrentUserId Long actorUserId,
                                    @Valid @RequestBody UpdateProfileRequest request) {
        return authService.updateProfile(actorUserId, request);
    }

    @PostMapping("/change-password")
    @Operation(
            summary = "Replace your password",
            description = """
                    Requires the current password as well as the new one. An access token is
                    a bearer credential, so a lifted one must not be enough on its own to
                    lock the real owner out.

                    Every outstanding refresh token is revoked, then a fresh pair is issued
                    for this request - so the browser doing the change stays signed in and
                    every other device is signed out within 15 minutes. **Store the returned
                    pair**: the refresh token you arrived with is dead by the time this
                    responds.

                    `401 INVALID_CREDENTIALS` if the current password is wrong, or if this
                    is a Google account with no local password to replace.""")
    public TokenResponse changePassword(@CurrentUserId Long actorUserId,
                                        @Valid @RequestBody ChangePasswordRequest request,
                                        HttpServletRequest http) {
        return authService.changePassword(actorUserId, request, http.getHeader("User-Agent"));
    }

    /** Shared by refresh and logout - both identify a session by its refresh token. */
    public record RefreshRequest(
            @NotBlank @JsonProperty("refresh_token") String refreshToken) {
    }
}
