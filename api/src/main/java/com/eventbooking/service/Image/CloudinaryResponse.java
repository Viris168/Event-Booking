package com.eventbooking.service.Image;

import lombok.Builder;

@Builder
public record CloudinaryResponse(
        String publicId,
        String url
) {}