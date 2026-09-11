package com.eventbooking.service.Organizer.impl;

import com.eventbooking.Enumeration.OrganizerApplicationStatus;
import com.eventbooking.Enumeration.Role;
import com.eventbooking.dto.organizer.OrganizerApplicationRequest;
import com.eventbooking.dto.organizer.OrganizerApplicationResponse;
import com.eventbooking.model.AppUser;
import com.eventbooking.model.OrganizerApplication;
import com.eventbooking.model.OrganizerProfile;
import com.eventbooking.organizer.error.AlreadyAnOrganizerException;
import com.eventbooking.organizer.error.OrganizerApplicationAlreadyDecidedException;
import com.eventbooking.organizer.error.OrganizerApplicationAlreadyPendingException;
import com.eventbooking.organizer.error.OrganizerApplicationNotFoundException;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.OrganizerApplicationRepository;
import com.eventbooking.repository.OrganizerProfileRepository;
import com.eventbooking.service.Organizer.OrganizerService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class OrganizerServiceimpl implements OrganizerService {

    private final OrganizerApplicationRepository organizerApplicationRepository;
    private final OrganizerProfileRepository organizerProfileRepository;
    private final AppUserRepository appUserRepository;

    public OrganizerServiceimpl(OrganizerApplicationRepository organizerApplicationRepository,
                                OrganizerProfileRepository organizerProfileRepository,
                                AppUserRepository appUserRepository) {
        this.organizerApplicationRepository = organizerApplicationRepository;
        this.organizerProfileRepository = organizerProfileRepository;
        this.appUserRepository = appUserRepository;
    }

    /**
     * Submit an application.
     *
     * <p>Both guards run before the insert rather than letting the database
     * catch the second one. {@code uq_organizer_application_pending} would
     * refuse a duplicate anyway, but as a DataIntegrityViolationException the
     * handler has no case for - a 500 where the applicant deserved "you already
     * have one waiting".
     *
     * <p>Profile first, deliberately: someone who is already an organiser gets
     * told that, which is a more useful answer than "you have one pending" for
     * a caller who happens to be both.
     */
    @Override
    @Transactional
    public OrganizerApplicationResponse apply(Long actorUserId, OrganizerApplicationRequest request) {
        if (organizerProfileRepository.findByUserId(actorUserId).isPresent()) {
            throw new AlreadyAnOrganizerException(actorUserId);
        }

        // A PLATFORM_ADMIN is refused for a different reason than it looks:
        // Role is single-valued, so approving them would write ORGANIZER over
        // their admin rights and silently demote them. Refusing here keeps that
        // row out of the queue entirely, so no admin can ever click it.
        AppUser applicant = requireUser(actorUserId);
        if (applicant.getRole() == Role.PLATFORM_ADMIN) {
            throw new AlreadyAnOrganizerException(actorUserId);
        }

        if (organizerApplicationRepository
                .findByUserIdAndStatus(actorUserId, OrganizerApplicationStatus.PENDING)
                .isPresent()) {
            throw new OrganizerApplicationAlreadyPendingException(actorUserId);
        }

        OrganizerApplication saved = organizerApplicationRepository.save(toEntity(actorUserId, request));

        // No reviewer yet - the row is PENDING, so reviewedBy is null by
        // construction and the DB CHECK requires it to stay that way.
        return toResponse(saved, applicant.getDisplayName(), null);
    }

    /**
     * Approve an application: the moment a customer becomes an organiser.
     *
     * <p>Three writes, and they must be one transaction. A partial commit
     * leaves an {@code app_user} with role ORGANIZER and no
     * {@code organizer_profile} row, which is the one state the system cannot
     * recover from on its own - OrganizerResolver refuses every write, the
     * person cannot re-apply because {@link #apply} sees the role, and nothing
     * short of a manual INSERT gets them out of it.
     *
     * <p>The profile is created here, not carried over from the application.
     * That is the whole reason the two tables are separate: a row in
     * organizer_profile MEANS you are an organiser (V13), so it cannot exist
     * while the request is still undecided.
     */
    @Override
    @Transactional
    public OrganizerApplicationResponse approve(Long adminUserId, Long applicationId) {
        OrganizerApplication application = requirePending(applicationId);
        AppUser applicant = requireUser(application.getUserId());

        // Between submission and this click the applicant may have been made an
        // organiser another way - a second application, or a hand-written
        // UPDATE. organizer_profile.user_id is UNIQUE, so inserting a second
        // profile would fail as a raw 23505 at commit.
        if (organizerProfileRepository.findByUserId(applicant.getId()).isPresent()) {
            throw new AlreadyAnOrganizerException(applicant.getId());
        }

        // 1. The decision. reviewedBy/reviewedAt are not optional garnish:
        //    organizer_application_review_consistent rejects any non-PENDING
        //    row that leaves them null.
        application.setStatus(OrganizerApplicationStatus.APPROVED);
        application.setReviewedBy(adminUserId);
        application.setReviewedAt(Instant.now());

        // 2. The role. Read on every /me and every login, so this is what the
        //    frontend eventually notices.
        applicant.setRole(Role.ORGANIZER);

        // 3. The profile - the row that actually grants the ability to own
        //    venues and events.
        //
        //    telegramChatId is left null on purpose. The application carries a
        //    handle ("@sokha"); this column is the numeric id the bot sends to,
        //    and is only learnable once the organiser messages the bot. Copying
        //    one into the other would produce a profile that looks configured
        //    for notifications and silently never delivers any.
        OrganizerProfile profile = OrganizerProfile.builder()
                .userId(applicant.getId())
                .orgNameEn(application.getOrgNameEn())
                .orgNameKm(application.getOrgNameKm())
                .telegramChatId(null)
                .build();

        organizerApplicationRepository.save(application);
        appUserRepository.save(applicant);
        organizerProfileRepository.save(profile);

        return toResponse(application, applicant.getDisplayName(), displayName(adminUserId));
    }

    /**
     * Turn an application down, with a reason the applicant can act on.
     *
     * <p>The row is kept rather than deleted - it is the audit trail, and the
     * reason is what the applicant is owed. They may apply again: only PENDING
     * rows collide under {@code uq_organizer_application_pending}.
     */
    @Override
    @Transactional
    public OrganizerApplicationResponse reject(Long adminUserId, Long applicationId, String note) {
        OrganizerApplication application = requirePending(applicationId);

        application.setStatus(OrganizerApplicationStatus.REJECTED);
        application.setReviewedBy(adminUserId);
        application.setReviewedAt(Instant.now());
        // Required by organizer_application_note_required. @NotBlank on the
        // request DTO is what turns a missing one into a 400 rather than a 500.
        application.setAdminNote(note);

        organizerApplicationRepository.save(application);

        return toResponse(application, displayName(application.getUserId()), displayName(adminUserId));
    }

    /**
     * One applicant's own history, newest first.
     *
     * <p>A list because reapplying after a rejection is expected, and the
     * screen has to show the rejected attempt alongside the new one or the
     * reason vanishes the moment they resubmit.
     *
     * <p>{@code reviewedByName} is deliberately null here. The admin table
     * names who decided; telling a rejected applicant which individual turned
     * them down invites them to take it up with that person. {@code adminNote}
     * still goes through - that is the part they are owed.
     */
    @Override
    @Transactional(readOnly = true)
    public List<OrganizerApplicationResponse> myApplications(Long actorUserId) {
        String applicantName = requireUser(actorUserId).getDisplayName();

        return organizerApplicationRepository.findByUserIdOrderBySubmittedAtDesc(actorUserId)
                .stream()
                .map(a -> toResponse(a, applicantName, null))
                .toList();
    }

    /**
     * The review queue: every application still waiting, longest wait first.
     *
     * <p>Unpaged. The queue is worked down rather than browsed, so a backlog
     * deep enough to need pages is a staffing problem this endpoint should make
     * visible rather than hide behind a page size.
     */
    @Override
    @Transactional(readOnly = true)
    public List<OrganizerApplicationResponse> pendingQueue() {
        return toResponses(organizerApplicationRepository
                .findByStatusOrderBySubmittedAtAsc(OrganizerApplicationStatus.PENDING));
    }

    // ------------------------------------------------------------
    // Guards
    // ------------------------------------------------------------

    /**
     * Load an application that is still open for a decision.
     *
     * <p>A plain findById, not an ownership helper: an admin does not own the
     * application, so the ownership check would refuse the only person allowed
     * to act on it. Authorization happened in the controller, via AdminResolver.
     *
     * <p>The status check is not defensive programming against a bug. Two
     * admins working the queue at the same time is the ordinary way to reach
     * it, and without this the second one silently overwrites the first one's
     * reviewedBy and adminNote.
     */
    private OrganizerApplication requirePending(Long applicationId) {
        OrganizerApplication application = organizerApplicationRepository.findById(applicationId)
                .orElseThrow(() -> new OrganizerApplicationNotFoundException(applicationId));

        if (application.getStatus() != OrganizerApplicationStatus.PENDING) {
            throw new OrganizerApplicationAlreadyDecidedException(applicationId, application.getStatus());
        }
        return application;
    }

    /**
     * The applicant's user row.
     *
     * <p>IllegalStateException rather than a 404: {@code user_id} is a FK, so a
     * missing row here means the database has lost referential integrity, not
     * that the caller asked for something that does not exist.
     */
    private AppUser requireUser(Long userId) {
        return appUserRepository.findById(userId)
                .orElseThrow(() -> new IllegalStateException(
                        "Application references a user that does not exist: " + userId));
    }

    // ------------------------------------------------------------
    // Mapping
    // ------------------------------------------------------------

    private OrganizerApplication toEntity(Long actorUserId, OrganizerApplicationRequest r) {
        // Everything omitted is correct by construction: id from IDENTITY,
        // status PENDING from @Builder.Default, submittedAt from
        // @CreationTimestamp, and the three review columns null - which is
        // exactly what organizer_application_review_consistent demands of a
        // PENDING row.
        return OrganizerApplication.builder()
                .userId(actorUserId)
                .orgNameEn(r.orgNameEn())
                .orgNameKm(r.orgNameKm())
                .telegramHandle(r.telegramHandle())
                .facebookUrl(r.facebookUrl())
                .eventTypes(r.eventTypes())
                .message(r.message())
                .build();
    }

    /**
     * Names are parameters rather than looked up in here, so a list caller can
     * resolve them all in one query instead of two per row. See
     * {@link #toResponses}.
     */
    private OrganizerApplicationResponse toResponse(OrganizerApplication a,
                                                    String applicantName,
                                                    String reviewedByName) {
        return new OrganizerApplicationResponse(
                a.getId(),
                a.getUserId(),
                applicantName,
                a.getOrgNameEn(),
                a.getOrgNameKm(),
                a.getTelegramHandle(),
                a.getFacebookUrl(),
                a.getEventTypes(),
                a.getMessage(),
                a.getStatus(),
                a.getAdminNote(),
                a.getReviewedBy(),
                reviewedByName,
                a.getReviewedAt(),
                a.getSubmittedAt()
        );
    }

    /**
     * Many applications with both names filled in, in one extra query.
     *
     * <p>For the admin queue, whenever you add it. The naive version - letting
     * toResponse resolve its own names - is two selects per row, so a queue of
     * fifty costs a hundred round trips to render one table.
     */
    private List<OrganizerApplicationResponse> toResponses(List<OrganizerApplication> rows) {
        Set<Long> userIds = new HashSet<>();
        for (OrganizerApplication row : rows) {
            userIds.add(row.getUserId());
            if (row.getReviewedBy() != null) {
                userIds.add(row.getReviewedBy());
            }
        }

        Map<Long, String> names = appUserRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(AppUser::getId, AppUser::getDisplayName));

        // names.get(null) is null on a HashMap, which is the right answer for a
        // PENDING row's reviewer.
        return rows.stream()
                .map(row -> toResponse(row, names.get(row.getUserId()), names.get(row.getReviewedBy())))
                .toList();
    }

    /** Null-safe: reviewedBy is null exactly while a row is PENDING. */
    private String displayName(Long userId) {
        if (userId == null) {
            return null;
        }
        return appUserRepository.findById(userId)
                .map(AppUser::getDisplayName)
                .orElse(null);
    }
}
