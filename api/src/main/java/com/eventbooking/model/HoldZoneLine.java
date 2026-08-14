package com.eventbooking.model;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "hold_zone_line",
       uniqueConstraints = @UniqueConstraint(columnNames = {"hold_id", "event_zone_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HoldZoneLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "hold_id", nullable = false)
    private Hold hold;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_zone_id", nullable = false)
    private EventZone eventZone;

    @Column(nullable = false)
    private Integer qty;
}
