package com.eventbooking.service.Organizer;

import com.eventbooking.dto.organizer.OrganizerApplicationRequest;
import com.eventbooking.dto.organizer.OrganizerApplicationResponse;

import java.util.List;

public interface OrganizerService {

    OrganizerApplicationResponse apply(Long actorUserId, OrganizerApplicationRequest organizerApplicationRequest);
    OrganizerApplicationResponse reject(Long adminUserId, Long applicationId, String note);
    List<OrganizerApplicationResponse> myApplications(Long actorUserId);
    OrganizerApplicationResponse approve(Long adminUserId, Long applicationId);
    List<OrganizerApplicationResponse> pendingQueue();
}
