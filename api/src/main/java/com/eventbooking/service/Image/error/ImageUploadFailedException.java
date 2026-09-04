package com.eventbooking.service.Image.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class ImageUploadFailedException extends ApiException {
    public ImageUploadFailedException(Throwable cause) {
        super(ErrorCode.INTERNAL_SERVER_ERROR, "Image upload failed.");
        initCause(cause);
    }
}
