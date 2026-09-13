package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class InvalidSalesWindowException extends ApiException {
    public InvalidSalesWindowException(String message) {
        super(ErrorCode.INVALID_SALES_WINDOW, message);
    }
}
