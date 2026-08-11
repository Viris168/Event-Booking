package com.eventbooking.inventory.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class InventoryContentionException extends ApiException {
    public InventoryContentionException(String message) {
        super(ErrorCode.INVENTORY_CONTENTION, message, true);
    }
}
