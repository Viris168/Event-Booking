package com.eventbooking.service.Organizer;

import com.eventbooking.dto.organizer.OrganizerApplicationRequest;
import com.eventbooking.dto.organizer.OrganizerApplicationResponse;

import com.eventbooking.Enumeration.OrganizerApplicationStatus;

import java.util.List;
import java.util.Map;

public interface OrganizerService {

    OrganizerApplicationResponse apply(Long actorUserId, OrganizerApplicationRequest organizerApplicationRequest);
    OrganizerApplicationResponse reject(Long adminUserId, Long applicationId, String note);
    List<OrganizerApplicationResponse> myApplications(Long actorUserId);
    OrganizerApplicationResponse approve(Long adminUserId, Long applicationId);
    List<OrganizerApplicationResponse> pendingQueue();

    /** One status' worth of applications, longest wait first. */
    List<OrganizerApplicationResponse> queue(OrganizerApplicationStatus status);

    /** How many applications sit in each status, zeros included. */
    Map<OrganizerApplicationStatus, Long> countsByStatus();
}
