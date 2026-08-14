package com.eventbooking.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.persistence.Version;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(
        name = "event_zone",
        uniqueConstraints = @UniqueConstraint(columnNames = {"event_id", "name_en"})
)
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EventZone {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id", nullable = false)
    private Event event;

    @Column(name = "name_en", nullable = false)
    private String nameEn;

    @Column(name = "name_km", nullable = false)
    private String nameKm;

    @Column(name = "price_usd_cents", nullable = false)
    private Integer priceUsdCents;

    @Column(nullable = false)
    private Integer capacity;

    @Column(name = "held_qty", nullable = false)
    @Builder.Default
    private Integer heldQty = 0;

    @Column(name = "sold_qty", nullable = false)
    @Builder.Default
    private Integer soldQty = 0;

    @Column(name = "active", nullable = false)
    @Builder.Default
    private Boolean active = true;

    @Version
    @Column(nullable = false)
    @Builder.Default
    private Long version = 0L;
}
