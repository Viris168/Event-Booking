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
        // The id, not just the check: the service refuses an admin disabling
        // their own account, and it can only do that if it knows who is asking.
        Long adminUserId = adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(adminUserService.setDisabled(adminUserId, id, true), HttpStatus.OK);
    }

    @PatchMapping("/{id}/enable")
    public ResponseEntity<AdminUserResponse> enable(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        Long adminUserId = adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(adminUserService.setDisabled(adminUserId, id, false), HttpStatus.OK);
    }

    /**
     * Erase the account.
     *
     * <p>Only reaches accounts with no history - see AdminUserService.delete
     * for the whole list of what counts as history, and why the rule is that
     * strict. In practice this is the spam signup and the duplicate
     * registration; everything else answers 409 and points at
     * {@link #anonymize}.
     *
     * <p>204 rather than the deleted row, matching AdminEventController.delete:
     * there is nothing left to return, and a body describing an account that no
     * longer exists is an invitation to keep using it.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        // The id, not just the check: the service refuses an admin deleting
        // their own account, and it can only do that if it knows who is asking.
        Long adminUserId = adminResolver.requireAdminUserId(actorUserId);
        adminUserService.delete(adminUserId, id);
        return new ResponseEntity<>(HttpStatus.NO_CONTENT);
    }

    /**
     * Clear the person out of the account, keeping its records.
     *
     * <p>The action for every account {@link #delete} refuses, and the one an
     * admin usually wants: it strips the name, phone, email, Telegram handle,
     * credentials and photo, and locks the account. The bookings, tickets and
     * payments stay, because they are the organiser's sales and the platform's
     * revenue as much as they are the customer's history.
     *
     * <p>PATCH, and it returns the row. Unlike delete there is still an account
     * here afterwards, and the table needs to redraw it - now reading "Deleted
     * user 812", disabled, with its booking count intact, which is the clearest
     * possible confirmation that the right thing happened.
     *
     * <p>No request body. There is nothing to configure: a partial
     * anonymisation, leaving the phone but clearing the email, is not a
     * coherent thing to want.
     */
    @PatchMapping("/{id}/anonymize")
    public ResponseEntity<AdminUserResponse> anonymize(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        Long adminUserId = adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(adminUserService.anonymize(adminUserId, id), HttpStatus.OK);
    }
}
