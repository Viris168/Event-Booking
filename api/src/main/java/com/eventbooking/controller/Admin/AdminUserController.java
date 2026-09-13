package com.eventbooking.controller.Admin;

import com.eventbooking.Enumeration.Role;
import com.eventbooking.dto.admin.AdminUserResponse;
import com.eventbooking.dto.admin.AdminUserUpdateRequest;
import com.eventbooking.security.AdminResolver;
import com.eventbooking.security.CurrentUserId;
import com.eventbooking.service.admin.AdminUserService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Account administration.
 *
 * <p>Behind {@link AdminResolver} for the same reason AdminEventController is:
 * this returns every account on the platform with its phone, email and booking
 * history, which is the single most sensitive list the API can produce.
 */
@RestController
@Slf4j
@CrossOrigin
@RequestMapping("/api/v1/admin/users")
public class AdminUserController {

    private final AdminUserService adminUserService;
    private final AdminResolver adminResolver;

    public AdminUserController(AdminUserService adminUserService, AdminResolver adminResolver) {
        this.adminUserService = adminUserService;
        this.adminResolver = adminResolver;
    }

    /**
     * The users table.
     *
     * <p>All three filters are optional and blank means "no filter", matching
     * how the screen sends an untouched control. {@code disabled} is a Boolean
     * rather than a boolean precisely so that absent and false stay different
     * answers: absent is "both", false is "active only".
     */
    @GetMapping
    public ResponseEntity<List<AdminUserResponse>> list(
            @CurrentUserId Long actorUserId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Role role,
            @RequestParam(required = false) Boolean disabled) {
        adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(adminUserService.list(q, role, disabled), HttpStatus.OK);
    }

    /**
     * Edit an account: name, contact details and role.
     *
     * <p>PATCH rather than PUT even though the form sends every field, because
     * the two it does not send - {@code is_disabled} and the credentials - are
     * not absent by accident. A PUT would invite a client to think blanking
     * them was on the table.
     *
     * <p>The caller's own id is passed down, not just checked: the service
     * refuses an admin changing their own role, and it can only do that if it
     * knows who is asking.
     */
    @PatchMapping("/{id}")
    public ResponseEntity<AdminUserResponse> update(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id,
            @Valid @RequestBody AdminUserUpdateRequest request) {
        Long adminUserId = adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(adminUserService.update(adminUserId, id, request), HttpStatus.OK);
    }

    /**
     * Lock an account out. Bookings and tickets are left alone - see
     * AdminUserService.setDisabled.
     */
    @PatchMapping("/{id}/disable")
    public ResponseEntity<AdminUserResponse> disable(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(adminUserService.setDisabled(id, true), HttpStatus.OK);
    }

    @PatchMapping("/{id}/enable")
    public ResponseEntity<AdminUserResponse> enable(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(adminUserService.setDisabled(id, false), HttpStatus.OK);
    }
}
