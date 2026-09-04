package com.eventbooking.service.Image.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

import java.util.Map;

public class UnsupportedFileTypeException extends ApiException {
    public UnsupportedFileTypeException(String filename, String extension, String allowed) {
        super(ErrorCode.UNSUPPORTED_FILE_TYPE, buildMessage(extension, allowed), false,
                Map.of("filename", filename, "allowed", allowed));
    }

    private static String buildMessage(String extension, String allowed) {
        // An extension-less upload is a different mistake from a .tiff, and the
        // uploader can only act on the difference if the message states it.
        if (extension == null || extension.isBlank()) {
            return "Upload has no file extension, so its type cannot be determined. Allowed: " + allowed + ".";
        }
        return "Unsupported file type '." + extension + "'. Allowed: " + allowed + ".";
    }
}
