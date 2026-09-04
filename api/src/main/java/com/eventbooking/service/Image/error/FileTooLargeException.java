package com.eventbooking.service.Image.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

import java.util.Map;

public class FileTooLargeException extends ApiException {
    public FileTooLargeException(long actualBytes, long maxBytes) {
        // The byte counts go in details as well as the message so the upload
        // form can render its own limit without parsing English out of it.
        super(ErrorCode.FILE_TOO_LARGE,
                "File is " + toMegabytes(actualBytes) + ", which is over the "
                        + toMegabytes(maxBytes) + " limit.",
                false,
                Map.of("actualBytes", actualBytes, "maxBytes", maxBytes));
    }

    private static String toMegabytes(long bytes) {
        return String.format("%.1fMB", bytes / (1024.0 * 1024.0));
    }
}
