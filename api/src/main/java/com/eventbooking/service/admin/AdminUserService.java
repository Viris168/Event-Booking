package com.eventbooking.service.admin;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.Role;
import com.eventbooking.dto.admin.AdminBookingSummary;
import com.eventbooking.dto.admin.AdminUserResponse;
import com.eventbooking.model.AppUser;
import com.eventbooking.model.Booking;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.BookingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The admin users screen, served from the database.
 *
 * <p>It previously ran off the web prototype's mock store, which meant the
 * moderation screen showed accounts that did not exist and, more to the point,
 * that disabling one did nothing to the real user's ability to log in.
 */
@Service
public class AdminUserService {

    /**
     * What counts as money this account has spent. REFUND_REQUESTED is in here
     * with CONFIRMED because asking for a refund does not un-take the payment -
     * only REFUNDED does, and that state is deliberately absent.
     */
    private static final Set<BookingStatus> SPEND_STATES =
            Collections.unmodifiableSet(EnumSet.of(BookingStatus.CONFIRMED, BookingStatus.REFUND_REQUESTED));

    private final AppUserRepository userRepository;
    private final BookingRepository bookingRepository;

    public AdminUserService(AppUserRepository userRepository, BookingRepository bookingRepository) {
        this.userRepository = userRepository;
        this.bookingRepository = bookingRepository;
    }

    /**
     * Accounts matching the screen's three filters, with each one's booking
     * history attached.
     *
     * <p>Two queries regardless of how many users match: one for the accounts,
     * one for every booking belonging to all of them at once. The obvious
     * shape - loop the users, ask for each one's bookings - is where a list
     * endpoint quietly becomes twenty.
     *
     * @param q        free text over display name, phone and email. Blank means no filter.
     * @param role     exact role, or null for all.
     * @param disabled true for disabled only, false for active only, null for both.
     */
    @Transactional(readOnly = true)
    public List<AdminUserResponse> list(String q, Role role, Boolean disabled) {
        // Escaping and wrapping happen here rather than in the query, so the
        // repository holds no string handling and a user who types '%' searches
        // for a literal percent sign instead of matching every row.
        String needle = (q == null || q.isBlank()) ? null
                : "%" + q.trim().toLowerCase().replace("!", "!!")
                                 .replace("%", "!%")
                                 .replace("_", "!_") + "%";

        List<AppUser> users = userRepository.searchForAdmin(needle, role, disabled);
        if (users.isEmpty()) return List.of();

        List<Long> userIds = users.stream().map(AppUser::getId).toList();
        Map<Long, List<Booking>> byUser = bookingRepository
                .findByUserIdInOrderByCreatedAtDesc(userIds)
                .stream()
                .collect(Collectors.groupingBy(Booking::getUserId));

        return users.stream().map(u -> {
            List<Booking> bookings = byUser.getOrDefault(u.getId(), List.of());
            long spend = bookings.stream()
                    .filter(b -> SPEND_STATES.contains(b.getState()))
                    .mapToLong(b -> b.getTotalUsdCents() == null ? 0L : b.getTotalUsdCents())
                    .sum();
            return new AdminUserResponse(
                    u.getId(),
                    u.getPhoneE164(),
                    u.getEmail(),
                    u.getDisplayName(),
                    u.getRole(),
                    Boolean.TRUE.equals(u.getIsDisabled()),
                    u.getProvider(),
                    u.getCreatedAt(),
                    bookings.size(),
                    spend,
                    bookings.stream().map(AdminUserService::toSummary).toList());
        }).toList();
    }

    /**
     * Lock an account out, or let it back in.
     *
     * <p>Existing bookings and tickets are deliberately untouched: someone
     * disabled mid-trip still holds a ticket somebody is going to scan, and
     * voiding it would turn a moderation decision into a person refused at a
     * gate. Disabling stops the login, nothing else.
     */
    @Transactional
    public AdminUserResponse setDisabled(Long userId, boolean disabled) {
        AppUser user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("No user with id " + userId));
        user.setIsDisabled(disabled);
        userRepository.save(user);

        List<Booking> bookings = bookingRepository.findByUserIdInOrderByCreatedAtDesc(List.of(userId));
        long spend = bookings.stream()
                .filter(b -> SPEND_STATES.contains(b.getState()))
                .mapToLong(b -> b.getTotalUsdCents() == null ? 0L : b.getTotalUsdCents())
                .sum();

        return new AdminUserResponse(
                user.getId(), user.getPhoneE164(), user.getEmail(), user.getDisplayName(),
                user.getRole(), disabled, user.getProvider(), user.getCreatedAt(),
                bookings.size(), spend,
                bookings.stream().map(AdminUserService::toSummary).toList());
    }

    private static AdminBookingSummary toSummary(Booking b) {
        return new AdminBookingSummary(
                b.getId(), b.getBookingRef(), b.getState(), b.getCreatedAt(), b.getTotalUsdCents());
    }
}
