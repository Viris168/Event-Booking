package com.eventbooking.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "venue_seat",
       uniqueConstraints = @UniqueConstraint(
           columnNames = {"venue_id", "section_label", "row_label", "seat_number"}
       ))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VenueSeat {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "venue_id", nullable = false)
    private Venue venue;

    @Column(name = "section_label", nullable = false)
    private String sectionLabel;

    @Column(name = "row_label", nullable = false)
    private String rowLabel;

    @Column(name = "seat_number", nullable = false)
    private String seatNumber;

    @Column(name = "pos_x", nullable = false, precision = 7, scale = 2)
    private BigDecimal posX;

    @Column(name = "pos_y", nullable = false, precision = 7, scale = 2)
    private BigDecimal posY;
}