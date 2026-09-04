package com.ticketing.api.security;

import com.ticketing.api.entity.EventStaff;
import com.ticketing.api.repository.EventStaffRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Runs after SessionJwtFilter has established "who". This establishes
 * "may this person scan for THIS event" by checking event_staff — the
 * single authorization boundary in the whole system. There is
 * intentionally no role/flag anywhere that skips this check; an
 * organizer and a door-staff scanner both go through the same lookup,
 * just with different EventStaff.Role values attached to the request.
 */
@Component
public class EventStaffInterceptor implements HandlerInterceptor {

    private final EventStaffRepository eventStaffRepository;

    public EventStaffInterceptor(EventStaffRepository eventStaffRepository) {
        this.eventStaffRepository = eventStaffRepository;
    }

    public static final String EVENT_ID_ATTR = "eventId";
    public static final String STAFF_ROLE_ATTR = "staffRole";

    @Override
    @SuppressWarnings("unchecked")
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof UUID userId)) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "MISSING_SESSION_TOKEN");
            return false;
        }

        Map<String, String> pathVars = (Map<String, String>) request.getAttribute(
                HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        String eventIdRaw = pathVars != null ? pathVars.get("eventId") : null;
        if (eventIdRaw == null) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "MISSING_EVENT_ID");
            return false;
        }

        UUID eventId;
        try {
            eventId = UUID.fromString(eventIdRaw);
        } catch (IllegalArgumentException e) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "INVALID_EVENT_ID");
            return false;
        }

        Optional<EventStaff> staff = eventStaffRepository.findByEventIdAndUserId(eventId, userId);
        if (staff.isEmpty()) {
            // 403, not 404 — don't distinguish "event doesn't exist" from
            // "you're not staffed on it" any more than necessary.
            response.sendError(HttpServletResponse.SC_FORBIDDEN, "NOT_STAFFED_ON_EVENT");
            return false;
        }

        request.setAttribute(EVENT_ID_ATTR, eventId);
        request.setAttribute(STAFF_ROLE_ATTR, staff.get().getRole());
        return true;
    }
}
