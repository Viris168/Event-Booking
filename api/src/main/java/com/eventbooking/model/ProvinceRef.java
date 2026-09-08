package com.eventbooking.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A Cambodian province, keyed by its ISO 3166-2:KH subdivision number.
 *
 * <p>A lookup table, and the target of {@code venue.province_code}. It had no
 * entity for a long time because nothing needed to read it - which is how the
 * web app came to ship its own invented two-letter list that matched none of
 * these codes, so every venue save outside the two seeded provinces failed the
 * foreign key.
 */
@Entity
@Table(name = "province_ref")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProvinceRef {

    /** ISO 3166-2:KH subdivision number, as text: "12" is Phnom Penh. */
    @Id
    private String code;

    @Column(name = "name_en", nullable = false)
    private String nameEn;

    @Column(name = "name_km", nullable = false)
    private String nameKm;
}
