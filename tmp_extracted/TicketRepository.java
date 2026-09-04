package com.ticketing.api.repository;

import com.ticketing.api.entity.Ticket;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TicketRepository extends JpaRepository<Ticket, UUID> {

    /**
     * Locks a single ticket row for the duration of the enclosing
     * @Transactional method. Directly equivalent to:
     *   SELECT * FROM tickets WHERE id = :id FOR UPDATE
     * A second call to this method for the same id, from another
     * transaction, blocks until the first transaction commits/rolls back.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Ticket t where t.id = :id")
    Optional<Ticket> findByIdForUpdate(@Param("id") UUID id);

    /**
     * Locks every ticket row under an order, scoped to eventId so a
     * cross-event order id can never be admitted through this event's
     * scanner. Equivalent to:
     *   SELECT * FROM tickets WHERE order_id = :orderId AND event_id = :eventId
     *   ORDER BY created_at ASC FOR UPDATE
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Ticket t where t.orderId = :orderId and t.eventId = :eventId order by t.createdAt asc")
    List<Ticket> findAllForOrderForUpdate(@Param("orderId") UUID orderId, @Param("eventId") UUID eventId);

    /** Unlocked read for the preview endpoint — no mutation, no need to block anyone. */
    List<Ticket> findByOrderIdAndEventId(UUID orderId, UUID eventId);
}
