package com.eventbooking;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class EventBookingApplication {

    public static void main(String[] args) {
        SpringApplication.run(EventBookingApplication.class, args);
    }
}
