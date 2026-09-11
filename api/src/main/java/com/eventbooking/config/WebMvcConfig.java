package com.eventbooking.config;

import com.eventbooking.security.CurrentUserIdArgumentResolver;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

/**
 * Registers the custom controller parameter types.
 *
 * <p>Spring resolves {@code @RequestHeader} and friends out of the box; a
 * project-specific annotation like {@code @CurrentUserId} has to be registered
 * or its parameters silently fall through to the catch-all resolver and arrive
 * as null. This is that registration, and it is the only reason this file
 * exists.
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final CurrentUserIdArgumentResolver currentUserIdArgumentResolver;

    public WebMvcConfig(CurrentUserIdArgumentResolver currentUserIdArgumentResolver) {
        this.currentUserIdArgumentResolver = currentUserIdArgumentResolver;
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(currentUserIdArgumentResolver);
    }
}
