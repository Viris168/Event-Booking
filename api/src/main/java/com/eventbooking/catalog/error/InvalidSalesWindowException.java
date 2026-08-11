package com.eventbooking.catalog.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class InvalidSalesWindowException extends ApiException {
    public InvalidSalesWindowException(String message) {
        super(ErrorCode.INVALID_SALES_WINDOW, message);
    }
}
