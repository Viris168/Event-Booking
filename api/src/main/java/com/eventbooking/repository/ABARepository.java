package com.eventbooking.repository;

import com.eventbooking.model.ABA.BankPaymentRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ABARepository extends JpaRepository<BankPaymentRequest, String> {

    Optional<BankPaymentRequest> findByTranidAndPaymentStatus(String tranid, String paymentStatus);

    List<BankPaymentRequest> findByPaymentStatusAndCreatedAtBefore(String paymentStatus, Instant createdAt);

    /** Changes state only if the transaction is still awaiting a payment. */
    @Modifying
    @Transactional
    @Query("update BankPaymentRequest p set p.paymentStatus = :newStatus "
            + "where p.tranid = :tranId and p.paymentStatus = :expectedStatus")
    int updatePaymentStatusIfCurrent(@Param("tranId") String tranId,
                                     @Param("expectedStatus") String expectedStatus,
                                     @Param("newStatus") String newStatus);
}
