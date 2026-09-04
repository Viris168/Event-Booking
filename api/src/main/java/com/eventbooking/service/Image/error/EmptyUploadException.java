package com.eventbooking.service.Image.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class EmptyUploadException extends ApiException {
    public EmptyUploadException() {
        super(ErrorCode.EMPTY_UPLOAD, "No file was uploaded, or the uploaded file is empty.");
    }
}
