package com.eventbooking.repository;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.model.Event;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import java.time.Instant;
import java.util.Collection;
import java.util.List;

public interface EventRepository extends JpaRepository<Event, Long> {

    /*
     * Image slots are written column by column, not through save().
     *
     * save() issues an UPDATE over every column of the row, built from the copy
     * of the event the transaction loaded. Two uploads in flight at once - a
     * cover and a banner, which is one click in the organiser form - both read
     * the row before either commits, so the second save writes back the first
     * one's stale column and that image silently disappears.
     *
     * These touch one column each, so the two uploads no longer overlap and
     * neither needs to know about the other. No version column and no retry:
     * the writes are genuinely independent.
     */

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Event e SET e.cloudinaryImageId = :url WHERE e.id = :eventId")
    int updateCoverImageId(@Param("eventId") Long eventId, @Param("url") String url);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Event e SET e.cloudinaryBannerId = :url WHERE e.id = :eventId")
    int updateBannerImageId(@Param("eventId") Long eventId, @Param("url") String url);

    /**
     * The public catalogue, narrowed by whatever the visitor asked for.
     *
     * <p>Restricted by status because findAll() is what let an unpublished
     * draft onto the home page the moment it was created. Every other filter is
     * skipped when its parameter is null, so this same query answers both an
     * untouched filter bar and a fully specified search - the alternative was
     * one method per combination of six optional filters.
     *
     * <p><b>The "from" price.</b> An event may be priced in seat_class, in
     * event_zone, or both, and the cards print the cheapest of the two as
     * "from $X". That number is what the price filters and the price sorts have
     * to agree with, so it is computed here rather than stored: a min_price
     * column would need rewriting by every path that touches a tier or a zone,
     * and the first one to forget would silently price an event wrong.
     * {@code least} ignores nulls, so an event priced in only one of the two
     * tables still gets a real answer, and one with no pricing at all gets
     * null - matched by no price filter, and sorted last.
     *
     * <p>The casts in the null guards are load-bearing, not decoration. A bare
     * {@code :param is null} gives Postgres a placeholder it sees in no typed
     * context, and it answers "could not determine data type of parameter"
     * rather than running the query at all. The cast is where the type comes
     * from.
     */
    @Query("""
        select e from Event e
        join e.venue v
        where e.status in :statuses
          and (cast(:titleLike as String) is null
               or lower(e.titleEn) like :titleLike escape '!'
               or lower(e.titleKm) like :titleLike escape '!'
               or lower(v.nameEn) like :titleLike escape '!'
               or lower(v.nameKm) like :titleLike escape '!')
          and (cast(:provinceCode as String) is null or v.provinceCode = :provinceCode)
          and (cast(:startsFrom as Instant) is null or e.startsAt >= :startsFrom)
          and (cast(:startsBefore as Instant) is null or e.startsAt < :startsBefore)
          and (cast(:minPriceCents as Integer) is null or least(
                  (select min(sc.priceUsdCents) from SeatClass sc where sc.event = e),
                  (select min(z.priceUsdCents) from EventZone z where z.event = e)) >= :minPriceCents)
          and (cast(:maxPriceCents as Integer) is null or least(
                  (select min(sc.priceUsdCents) from SeatClass sc where sc.event = e),
                  (select min(z.priceUsdCents) from EventZone z where z.event = e)) <= :maxPriceCents)
        order by
          case when :sort = 'PRICE_LOW' then least(
                  (select min(sc.priceUsdCents) from SeatClass sc where sc.event = e),
                  (select min(z.priceUsdCents) from EventZone z where z.event = e)) end asc nulls last,
          case when :sort = 'PRICE_HIGH' then least(
                  (select min(sc.priceUsdCents) from SeatClass sc where sc.event = e),
                  (select min(z.priceUsdCents) from EventZone z where z.event = e)) end desc nulls last,
          e.startsAt asc,
          e.id asc
        """)
    Page<Event> search(@Param("statuses") Collection<EventStatus> statuses,
                       @Param("titleLike") String titleLike,
                       @Param("provinceCode") String provinceCode,
                       @Param("startsFrom") Instant startsFrom,
                       @Param("startsBefore") Instant startsBefore,
                       @Param("minPriceCents") Integer minPriceCents,
                       @Param("maxPriceCents") Integer maxPriceCents,
                       @Param("sort") String sort,
                       Pageable pageable);

    @Query("""
        select e from Event e
        where e.organizerId = :organizerId
        and (:status is null or e.status = :status)
        order by e.startsAt asc
        """)
    List<Event> findForOrganizer(@Param("organizerId") Long organizerId,
                                 @Param("status") EventStatus status);
}
