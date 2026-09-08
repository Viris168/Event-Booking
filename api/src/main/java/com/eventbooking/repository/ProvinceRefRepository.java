package com.eventbooking.repository;

import com.eventbooking.model.ProvinceRef;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProvinceRefRepository extends JpaRepository<ProvinceRef, String> {

    /** Alphabetical, because a form's dropdown is read, not indexed. */
    List<ProvinceRef> findAllByOrderByNameEnAsc();
}
