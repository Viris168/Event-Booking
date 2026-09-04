package com.eventbooking.model;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.InventoryMode;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "event")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Event {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "organizer_id", nullable = false)
    private Long organizerId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "venue_id", nullable = false)
    private Venue venue;

    @Enumerated(EnumType.STRING)
    @Column(name = "inventory_mode", nullable = false)
    private InventoryMode inventoryMode;

    @Column(nullable = false, unique = true)
    private String slug;

    @Column(name = "title_en", nullable = false)
    private String titleEn;

    @Column(name = "title_km", nullable = false)
    private String titleKm;

    @Column(name = "description_en", nullable = false)
    @Builder.Default
    private String descriptionEn = "";

    @Column(name = "description_km", nullable = false)
    @Builder.Default
    private String descriptionKm = "";

    @Column(name = "category")
    @Builder.Default
    private String category = "MUSIC";

    @Column(name = "cover")
    @Builder.Default
    private Integer cover = 1;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private EventStatus status = EventStatus.DRAFT;

    /**
     * When the event most recently entered PENDING_REVIEW. Cleared on withdraw,
     * so a resubmitted event does not claim to have been queuing since its
     * first attempt and push itself to the top of the reviewer's list.
     */
    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "doors_open_at", nullable = false)
    private Instant doorsOpenAt;

    @Column(name = "sales_open_at", nullable = false)
    private Instant salesOpenAt;

    @Column(name = "sales_close_at", nullable = false)
    private Instant salesCloseAt;

    /**
     * Written by Hibernate on insert, not by the column DEFAULT. The DEFAULT is
     * still there for anything that writes the table outside JPA (Flyway seeds,
     * psql), but relying on it here left this field null in the entity the
     * INSERT was built from - and createEvent returns that same instance, so
     * every POST /event answered with createdAt: null. Matches Venue.
     */
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @OneToMany(mappedBy = "event", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<SeatClass> seatClasses = new ArrayList<>();

    @OneToMany(mappedBy = "event", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<EventZone> zones = new ArrayList<>();

    @OneToMany(mappedBy = "event", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<EventSeat> seats = new ArrayList<>();

    @OneToMany(mappedBy = "event")
    @Builder.Default
    private List<Hold> holds = new ArrayList<>();

    @Column(name = "cloudinary_image_id")
    private String cloudinaryImageId;

    @Column(name = "cloudinary_banner_id")
    private String cloudinaryBannerId;
}
