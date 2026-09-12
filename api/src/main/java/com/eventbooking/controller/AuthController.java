package com.eventbooking.controller;

import com.eventbooking.dto.auth.ChangePasswordRequest;
import com.eventbooking.dto.auth.GoogleLoginRequest;
import com.eventbooking.dto.auth.SetPhoneRequest;
import com.eventbooking.dto.auth.LoginRequest;
import com.eventbooking.dto.auth.MeResponse;
import com.eventbooking.dto.auth.RegisterRequest;
import com.eventbooking.dto.auth.TokenResponse;
import com.eventbooking.dto.auth.UpdateProfileRequest;
import com.eventbooking.security.AuthService;
import com.eventbooking.security.CurrentUserId;
import com.eventbooking.security.LoginRateLimiter;
import com.eventbooking.security.RefreshCookie;
import com.eventbooking.security.error.InvalidCredentialsException;
import com.eventbooking.security.error.InvalidRefreshTokenException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Auth", description = "Registration, sign-in, and token lifecycle")
public class AuthController {

    private final AuthService authService;
    private final RefreshCookie refreshCookie;
    private final LoginRateLimiter loginRateLimiter;

    public AuthController(AuthService authService,
                          RefreshCookie refreshCookie,
                          LoginRateLimiter loginRateLimiter) {
        this.authService = authService;
        this.refreshCookie = refreshCookie;
        this.loginRateLimiter = loginRateLimiter;
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
        return issued(authService.register(request, http.getHeader("User-Agent")),
                HttpStatus.CREATED);
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
    public ResponseEntity<TokenResponse> login(@Valid @RequestBody LoginRequest request,
                                               HttpServletRequest http) {
        String address = http.getRemoteAddr();

        // Before the password is checked, so a refused attempt costs a map
        // lookup instead of a BCrypt hash.
        loginRateLimiter.check(address, request.phoneE164());

        try {
            TokenResponse tokens = authService.login(request, http.getHeader("User-Agent"));
            loginRateLimiter.recordSuccess(request.phoneE164());
            return issued(tokens, HttpStatus.OK);
        } catch (InvalidCredentialsException e) {
            // Only a wrong credential counts. A disabled account is not a
            // guess, and locking it out would let anyone freeze an account they
            // know the number of by failing against it repeatedly.
            loginRateLimiter.recordFailure(address, request.phoneE164());
            throw e;
        }
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
    public ResponseEntity<TokenResponse> refresh(
            @CookieValue(name = RefreshCookie.NAME, required = false) String refreshToken,
            HttpServletRequest http) {
        // No cookie is the same answer as a bad one. A client that lost it has
        // no session, which is exactly what an expired or revoked token means.
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new InvalidRefreshTokenException();
        }
        return issued(authService.refresh(refreshToken, http.getHeader("User-Agent")),
                HttpStatus.OK);
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
    public ResponseEntity<Void> logout(
            @CookieValue(name = RefreshCookie.NAME, required = false) String refreshToken) {
        if (refreshToken != null && !refreshToken.isBlank()) {
            authService.logout(refreshToken);
        }
        // Cleared even when there was nothing to revoke: a browser holding a
        // cookie the server does not recognise should not keep sending it.
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, refreshCookie.clear().toString())
                .build();
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
                    every other device is signed out within 15 minutes. The new refresh
                    token arrives as a `Set-Cookie`, like every other issuing endpoint; the
                    one the browser arrived with is dead by the time this responds.

                    `401 INVALID_CREDENTIALS` if the current password is wrong, or if this
                    is a Google account with no local password to replace.""")
    public ResponseEntity<TokenResponse> changePassword(@CurrentUserId Long actorUserId,
                                                        @Valid @RequestBody ChangePasswordRequest request,
                                                        HttpServletRequest http) {
        return issued(authService.changePassword(actorUserId, request, http.getHeader("User-Agent")),
                HttpStatus.OK);
    }

    @PostMapping("/google")
    @Operation(
            summary = "Sign in with Google",
            description = """
                    Takes the ID token the browser received from Google Identity Services
                    and returns what `/auth/login` returns - access token in the body,
                    refresh token in the httpOnly cookie. The account is created on first
                    sign-in.

                    Matched on Google's permanent `sub`, never on the email address: an
                    address can be renamed or, inside a Workspace domain, reassigned to a
                    different person.

                    A Google account arrives with **no phone number**, which is what a null
                    `phone_e164` on `/auth/me` means. Send the user to add one before
                    checkout; `POST /auth/me/phone` fills it.

                    `401 INVALID_GOOGLE_TOKEN` covers every verification failure and the
                    case where Google sign-in is not configured here. `409
                    EMAIL_ALREADY_REGISTERED` when a password account already holds that
                    address - linking the two is a deliberate action, not something this
                    endpoint does silently.""")
    public ResponseEntity<TokenResponse> google(@Valid @RequestBody GoogleLoginRequest request,
                                                HttpServletRequest http) {
        return issued(authService.loginWithGoogle(request.idToken(), http.getHeader("User-Agent")),
                HttpStatus.OK);
    }

    @PostMapping("/me/phone")
    @Operation(
            summary = "Add the phone number a Google account signed up without",
            description = """
                    Fills `phone_e164` when it is null. It cannot replace one: the number is
                    the login identifier and the access token's subject, so changing it
                    would invalidate every token its owner holds.

                    `409 PHONE_NUMBER_REQUIRED` if the account already has a number,
                    `409 PHONE_ALREADY_REGISTERED` if it belongs to someone else.""")
    public MeResponse setPhone(@CurrentUserId Long actorUserId,
                               @Valid @RequestBody SetPhoneRequest request) {
        return authService.setPhone(actorUserId, request);
    }

    /**
     * Sends the pair the only way a browser should receive it: the access token
     * in the body for the Authorization header, the refresh token in an
     * httpOnly cookie the page's own scripts cannot read.
     */
    private ResponseEntity<TokenResponse> issued(TokenResponse tokens, HttpStatus status) {
        return ResponseEntity.status(status)
                .header(HttpHeaders.SET_COOKIE, refreshCookie.issue(tokens.refreshToken()).toString())
                .body(tokens.inCookie());
    }
}
