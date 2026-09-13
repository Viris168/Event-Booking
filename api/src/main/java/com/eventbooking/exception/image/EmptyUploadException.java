package com.eventbooking.exception.image;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class EmptyUploadException extends ApiException {
    public EmptyUploadException() {
        super(ErrorCode.EMPTY_UPLOAD, "No file was uploaded, or the uploaded file is empty.");
    }
}
