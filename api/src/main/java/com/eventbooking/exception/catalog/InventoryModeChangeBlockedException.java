package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class InventoryModeChangeBlockedException extends ApiException {
    public InventoryModeChangeBlockedException(String message) {
        super(ErrorCode.INVENTORY_MODE_CHANGE_BLOCKED, message);
    }
}
