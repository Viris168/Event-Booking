package com.ticketing.api.config;

import com.ticketing.api.security.EventStaffInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final EventStaffInterceptor eventStaffInterceptor;

    public WebConfig(EventStaffInterceptor eventStaffInterceptor) {
        this.eventStaffInterceptor = eventStaffInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(eventStaffInterceptor)
                .addPathPatterns("/api/events/{eventId}/verify/**");
    }
}
