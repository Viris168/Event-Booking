package com.eventbooking.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.time.Clock;

@Configuration
public class TimeConfig {

    @Bean
    public Clock clock() {
        // Creates a standard UTC clock that can be injected anywhere in the app
        return Clock.systemUTC();
    }
}
