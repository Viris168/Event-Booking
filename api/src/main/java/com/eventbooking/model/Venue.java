package com.eventbooking.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "venue")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Venue {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * The organiser who owns this venue.
     *
     * <p>Venues are private: only their owner may edit one, edit its seat map,
     * retire it, or host an event at it. V21 made this column nullable so that
     * a null could mean "a shared platform venue any organiser may use", and
     * V27 withdrew that meaning - a null owner now means a venue nobody can
     * reach, which is why V27 also retires the ones that were left.
     *
     * <p>Still nullable rather than restored to NOT NULL, because a migration
     * that tightened it would fail outright on any database still holding one
     * of those rows. Nothing creates a null owner: createVenue always writes
     * the caller's organizer_profile id.
     */
    @Column(name = "organizer_id")
    private Long organizerId;

    @Column(name = "name_en", nullable = false)
    private String nameEn;

    @Column(name = "name_km", nullable = false)
    private String nameKm;

    @Column(name = "province_code", nullable = false)
    private String provinceCode;

    @Column(name = "khan_district", nullable = false)
    private String khanDistrict;

    @Column(name = "sangkat_commune", nullable = false)
    private String sangkatCommune;

    @Column(name = "street_address", nullable = false)
    private String streetAddress;

    @Column(precision = 9, scale = 6)
    private BigDecimal lat;

    @Column(precision = 9, scale = 6)
    private BigDecimal lng;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @OneToMany(mappedBy = "venue")
    @Builder.Default
    private List<Event> events = new ArrayList<>();

    @Column(name = "is_disabled", nullable = false)
    @Builder.Default
    private Boolean isDisabled = false;
}
