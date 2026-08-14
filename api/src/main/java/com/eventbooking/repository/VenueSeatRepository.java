package com.eventbooking.repository;

import com.eventbooking.model.VenueSeat;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VenueSeatRepository extends JpaRepository<VenueSeat, Long> {
}