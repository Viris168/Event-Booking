package com.eventbooking.repository;

import com.eventbooking.model.Hold;
import com.eventbooking.model.HoldZoneLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface HoldZoneLineRepository extends JpaRepository<HoldZoneLine, Long> {

    /**
     * The zone lines of a hold, with eventZone left as a lazy proxy on
     * purpose. Callers read the proxies' ids (which costs no query) and then
     * materialise the zones through EventZoneRepository.findAllByIdForUpdate,
     * so the counters they go on to mutate are read under the row lock rather
     * than before it.
     */
    @Query("select l from HoldZoneLine l where l.hold.id = :holdId")
    List<HoldZoneLine> findByHoldId(@Param("holdId") Long holdId);

    HoldZoneLine findByHold(Hold hold);
}
