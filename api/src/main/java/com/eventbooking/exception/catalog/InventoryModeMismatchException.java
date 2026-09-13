package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class InventoryModeMismatchException extends ApiException {
    public InventoryModeMismatchException(String message) {
        super(ErrorCode.INVENTORY_MODE_MISMATCH, message);
    }
}
