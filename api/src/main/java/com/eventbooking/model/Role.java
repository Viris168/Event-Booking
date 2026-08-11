package com.eventbooking.model;

/**
 * Must stay in sync with the CHECK constraint on app_user.role
 * in V1__schema.sql. Adding a value here without a matching
 * migration will fail at insert time, not at startup.
 */
public enum Role {
    CUSTOMER,
    ORGANIZER,
    PLATFORM_ADMIN
}
