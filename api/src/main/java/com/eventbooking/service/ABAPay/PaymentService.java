package com.eventbooking.service.ABAPay;

import com.eventbooking.model.ABA.BankPaymentResponse;

import java.util.Map;

public interface PaymentService {

    BankPaymentResponse createQrPayment(Map<String, Object> requestPayload);

    Map<String, Object> closeTransaction(String tranId);

    Map<String, Object> checkTransactionStatus(String tranId);

    Object getTransactionDetails(String tranId);

    Object getAllTransactions();
}