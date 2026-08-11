package com.eventbooking.catalog.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class InventoryModeChangeBlockedException extends ApiException {
    public InventoryModeChangeBlockedException(String message) {
        super(ErrorCode.INVENTORY_MODE_CHANGE_BLOCKED, message);
    }
}
