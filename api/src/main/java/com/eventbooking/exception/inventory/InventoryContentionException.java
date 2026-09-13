package com.eventbooking.exception.inventory;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class InventoryContentionException extends ApiException {
    public InventoryContentionException(String message) {
        super(ErrorCode.INVENTORY_CONTENTION, message, true);
    }
}
