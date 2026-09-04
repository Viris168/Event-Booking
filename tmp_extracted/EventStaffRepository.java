package com.ticketing.api.repository;

import com.ticketing.api.entity.EventStaff;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface EventStaffRepository extends JpaRepository<EventStaff, UUID> {
    Optional<EventStaff> findByEventIdAndUserId(UUID eventId, UUID userId);
}
