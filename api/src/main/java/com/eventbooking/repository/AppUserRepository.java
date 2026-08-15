package com.eventbooking.repository;

import com.eventbooking.model.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * Minimal for now - the auth lane will add the lookups it needs for login
 * (by phone, by email) on top of this.
 */
public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    Optional<AppUser> findByPhoneE164(String phoneE164);
}
