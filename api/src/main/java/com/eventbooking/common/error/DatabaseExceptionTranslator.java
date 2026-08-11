package com.eventbooking.common.error;

import com.eventbooking.catalog.error.*;
import com.eventbooking.inventory.error.*;
import org.postgresql.util.PSQLException;
import org.postgresql.util.ServerErrorMessage;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;

@Component
public class DatabaseExceptionTranslator {

    private static final String SQLSTATE_UNIQUE_VIOLATION = "23505";
    private static final String SQLSTATE_FOREIGN_KEY_VIOLATION = "23503";
    private static final String SQLSTATE_CHECK_VIOLATION = "23514";
    
    private static final String SQLSTATE_SERIALIZATION_FAILURE = "40001";
    private static final String SQLSTATE_DEADLOCK_DETECTED = "40P01";
    private static final String SQLSTATE_LOCK_NOT_AVAILABLE = "55P03";

    public RuntimeException translate(DataAccessException ex) {
        Throwable rootCause = NestedExceptionUtils.getRootCause(ex);
        
        if (rootCause instanceof PSQLException psqlEx) {
            String sqlState = psqlEx.getSQLState();
            ServerErrorMessage serverMessage = psqlEx.getServerErrorMessage();
            String constraint = serverMessage != null ? serverMessage.getConstraint() : null;

            if (sqlState != null) {
                return switch (sqlState) {
                    case SQLSTATE_UNIQUE_VIOLATION -> handleUniqueViolation(constraint, ex);
                    case SQLSTATE_FOREIGN_KEY_VIOLATION -> handleForeignKeyViolation(constraint, ex);
                    case SQLSTATE_CHECK_VIOLATION -> handleCheckViolation(constraint, ex);
                    case SQLSTATE_SERIALIZATION_FAILURE, 
                         SQLSTATE_DEADLOCK_DETECTED, 
                         SQLSTATE_LOCK_NOT_AVAILABLE -> new InventoryContentionException("Database concurrency conflict preventing write operations.");
                    default -> ex; 
                };
            }
        }
        return ex; // Return original exception if untranslatable (handled as 500 later)
    }

    private RuntimeException handleUniqueViolation(String constraint, DataAccessException original) {
        if (constraint == null) return original;
        return switch (constraint) {
            case "uq_seat_class_name_event" -> new DuplicateSeatClassException("Seat class name must be unique per event.");
            case "uq_seat_class_order_event" -> new DuplicateSeatClassOrderException("Seat class display order must be unique per event.");
            case "uq_event_zone_name_event" -> new DuplicateZoneNameException("Zone name must be unique per event.");
            case "uq_event_seat_location" -> new DuplicateSeatLocationException("Seat location must be unique within the venue.");
            case "uq_active_hold_seat" -> new SeatUnavailableException("Seat is already held by another active hold.");
            default -> original;
        };
    }

    private RuntimeException handleForeignKeyViolation(String constraint, DataAccessException original) {
        if (constraint == null) return original;
        if ("fk_event_seat_zone".equals(constraint)) {
            return new CrossEventReferenceException("Entities referenced across mismatching events.");
        }
        return original;
    }

    private RuntimeException handleCheckViolation(String constraint, DataAccessException original) {
        if (constraint == null) return original;
        if ("chk_hold_target_mode".equals(constraint)) {
            return new InvalidHoldTargetException("Hold target violates inventory mode check constraints.");
        }
        return original;
    }
}