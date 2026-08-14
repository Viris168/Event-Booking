package com.eventbooking.repository;

import com.eventbooking.model.Hold;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HoldRepository extends JpaRepository<Hold,Long> {
}
