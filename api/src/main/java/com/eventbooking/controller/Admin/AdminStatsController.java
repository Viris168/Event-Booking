package com.eventbooking.controller.Admin;

import com.eventbooking.dto.admin.PlatformStatsResponse;
import com.eventbooking.dto.admin.RecentBookingResponse;
import com.eventbooking.dto.admin.RecentEventResponse;
import com.eventbooking.security.AdminResolver;
import com.eventbooking.security.CurrentUserId;
import com.eventbooking.service.admin.AdminStatsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * The admin dashboard's reads.
 *
 * <p>Kept apart from the moderation controllers because nothing here is a
 * decision: every endpoint is pure reporting, and none writes a row or an
 * audit entry.
 */
@RestController
@Slf4j
@CrossOrigin
@RequestMapping("/api/v1/admin/stats")
public class AdminStatsController {

    private final AdminStatsService adminStatsService;
    private final AdminResolver adminResolver;

    public AdminStatsController(AdminStatsService adminStatsService, AdminResolver adminResolver) {
        this.adminStatsService = adminStatsService;
        this.adminResolver = adminResolver;
    }

    @GetMapping
    public ResponseEntity<PlatformStatsResponse> stats(@CurrentUserId Long actorUserId) {
        adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(adminStatsService.stats(), HttpStatus.OK);
    }

    /**
     * Latest bookings. Capped at 50 so a mistyped limit cannot ask for the
     * whole table through an endpoint meant to fill a strip of eight rows.
     */
    @GetMapping("/recent-bookings")
    public ResponseEntity<List<RecentBookingResponse>> recentBookings(
            @CurrentUserId Long actorUserId,
            @RequestParam(defaultValue = "8") int limit) {
        adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(
                adminStatsService.recentBookings(Math.clamp(limit, 1, 50)), HttpStatus.OK);
    }

    /**
     * Latest events, newest listing first. Same cap and same reasoning as the
     * bookings strip above.
     */
    @GetMapping("/recent-events")
    public ResponseEntity<List<RecentEventResponse>> recentEvents(
            @CurrentUserId Long actorUserId,
            @RequestParam(defaultValue = "8") int limit) {
        adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(
                adminStatsService.recentEvents(Math.clamp(limit, 1, 50)), HttpStatus.OK);
    }
}
