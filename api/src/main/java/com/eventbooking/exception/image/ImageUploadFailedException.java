package com.eventbooking.exception.image;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class ImageUploadFailedException extends ApiException {
    public ImageUploadFailedException(Throwable cause) {
        super(ErrorCode.INTERNAL_SERVER_ERROR, "Image upload failed.");
        initCause(cause);
    }
}
