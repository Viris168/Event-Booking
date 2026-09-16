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

    /**
     * This organiser's events that have already happened, most recent first.
     *
     * <p>"Happened" is {@code startsAt < now}, because there is no
     * {@code ends_at} column and never has been - {@code EventServiceimpl}
     * reads finishing the same way in three places, and the FINISHED badge the
     * catalogue renders is derived from it too. A fourth definition here would
     * let an event the organiser's own dashboard calls finished be refused a
     * payout.
     *
     * <p>Unfiltered by status on purpose: a taken-down event still sold
     * tickets, and the organiser is owed for them. Whether the catalogue lists
     * it has nothing to do with whether money changed hands.
     */
    @Query("""
        select e from Event e
        where e.organizerId = :organizerId
          and e.startsAt < :now
        order by e.startsAt desc
        """)
    List<Event> findFinishedForOrganizer(@Param("organizerId") Long organizerId,
                                         @Param("now") Instant now);

    /**
     * The moderation queue. One status at a time, ordered by the caller's
     * Pageable so the admin screen can ask for oldest-submitted-first.
     *
     * <p>Deliberately not merged into {@link #findByStatusIn}: that one is the
     * public catalogue and its status set is fixed on purpose. Opening it to an
     * arbitrary status would put every DRAFT back in front of anonymous
     * callers, which is the exact regression its comment above describes.
     */
    Page<Event> findByStatus(EventStatus status, Pageable pageable);

    /** Admin dashboard counters, one status at a time. */
    long countByStatus(EventStatus status);

    /**
     * The moderation table: every event on the platform, any owner, filtered by
     * the three controls the screen offers.
     *
     * <p>Distinct from {@link #findByStatus} (one status, the review queue) and
     * from the public catalogue search, which is fixed to the publicly visible
     * statuses by design. A null status here means "every moderatable status",
     * which is exactly what must never be possible on the public endpoint.
     *
     * <p>venue is fetched because each row prints a venue name and province.
     *
     * <p>DRAFT is excluded unconditionally, for the same reason the review
     * queue never lists one: a draft is the organiser's private workspace and
     * has not been submitted to anybody, so there is no moderation decision to
     * take on it. The screen's filter does not offer DRAFT either; passing it
     * anyway returns nothing rather than failing, which is the correct answer
     * to "show me the drafts".
     *
     * <p>status carries no {@code cast(...)} while the two String parameters
     * do. The casts exist because Postgres cannot infer a bare parameter's type
     * in {@code :p is null}, but spelling one out for the enum made Hibernate
     * render {@code cast(? as smallint)} - an ordinal - against a column mapped
     * {@code EnumType.STRING}, so every filtered call died on "invalid input
     * syntax for type smallint". Hibernate infers the enum correctly on its
     * own; it is only the Strings that need the help.
     */
    @Query("""
            select e from Event e
            join fetch e.venue v
            where e.status <> com.eventbooking.Enumeration.EventStatus.DRAFT
              and (:status is null or e.status = :status)
              and (cast(:provinceCode as String) is null or v.provinceCode = :provinceCode)
              and (cast(:q as String) is null
                   or lower(e.titleEn) like :q escape '!'
                   or lower(e.titleKm) like :q escape '!'
                   or lower(v.nameEn) like :q escape '!'
                   or lower(v.nameKm) like :q escape '!')
            order by e.startsAt asc
            """)
    List<Event> searchForAdmin(@Param("q") String q,
                               @Param("status") EventStatus status,
                               @Param("provinceCode") String provinceCode);

    /**
     * How much this organiser still owns - the guard on demoting them.
     *
     * <p>Losing the ORGANIZER role means losing the {@code organizer_profile}
     * row, and {@code event.organizer_id} points straight at it. Demoting
     * somebody who still owns events would leave rows referring to a profile
     * that no longer exists, which is a moderation click turning into a
     * constraint violation.
     */
    long countByOrganizerId(Long organizerId);

    /**
     * How many events sit in each status, in one pass.
     *
     * <p>Backs the review queue's status tabs, which show all four counts at
     * once. Four {@link #countByStatus} calls per refresh would be four round
     * trips for four integers on a page that polls.
     *
     * <p>{@code [status, count]} per row, and only for statuses that have any -
     * the caller fills the zeros.
     */
    @Query("select e.status, count(e) from Event e group by e.status")
    List<Object[]> countGroupedByStatus();

    /**
     * How many events are actually selling right now.
     *
     * <p>Not the same question as {@code countByStatus(PUBLISHED)}, which is
     * what the dashboard used to show. Publishing is a decision an organiser
     * made once and it never expires, so that count folds in every show that
     * finished last year - it can only go up, and it says nothing about what is
     * on sale today.
     *
     * <p>The three conditions are the stored half of the browser's salesState():
     * published, the sales window is open, and the event has not happened yet.
     * The one condition NOT reproduced here is sold-out, which needs the zone
     * and seat aggregates - so a sold-out event still counts as on sale. That is
     * the honest reading anyway: it is listed and its window is open, there is
     * simply nothing left to sell.
     */
    @Query("""
            select count(e) from Event e
            where e.status = com.eventbooking.Enumeration.EventStatus.PUBLISHED
              and e.salesOpenAt <= :now
              and e.salesCloseAt >= :now
              and e.startsAt > :now
            """)
    long countOnSale(@Param("now") Instant now);

    /**
     * The dashboard's latest-events strip: newest listing first.
     *
     * <p>Ordered by {@code createdAt}, not {@code startsAt} like
     * {@link #searchForAdmin}. The moderation table is a diary - what is coming
     * up - while this answers "what has just appeared on the platform", and the
     * two disagree completely: an event put up this morning for next year sorts
     * last in the table and first here.
     *
     * <p>DRAFT is excluded for the same reason the moderation table and the
     * review queue exclude it: a draft is the organiser's private workspace,
     * not something that has been shown to anybody.
     *
     * <p>venue is fetched with it because the strip prints a venue name, and a
     * lazy proxy resolved during serialisation is the same N+1 by a quieter
     * route.
     *
     * <p>id breaks ties because {@code created_at} is not unique: a seeded or
     * bulk-imported batch shares one timestamp to the microsecond, and without
     * a second key Postgres is free to return a different eight of them each
     * time the dashboard is opened.
     */
    @Query("""
            select e from Event e
            join fetch e.venue
            where e.status <> com.eventbooking.Enumeration.EventStatus.DRAFT
            order by e.createdAt desc, e.id desc
            """)
    List<Event> findRecentForAdmin(Pageable pageable);
}
