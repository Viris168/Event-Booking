package com.eventbooking.model.ABA;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public class BankStatusResponse {

        private TransactionData data;
        private Status status;

        public TransactionData getData() { return data; }
        public void setData(TransactionData data) { this.data = data; }

        public Status getStatus() { return status; }
        public void setStatus(Status status) { this.status = status; }

        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class TransactionData {
            private String apv;

            @JsonProperty("discount_amount")
            private Double discountAmount;

            @JsonProperty("original_amount")
            private Double originalAmount;

            @JsonProperty("payment_amount")
            private Double paymentAmount;

            @JsonProperty("payment_currency")
            private String paymentCurrency;

            /** APPROVED, PENDING, DECLINED, REFUNDED, CANCELLED, PRE-AUTH */
            @JsonProperty("payment_status")
            private String paymentStatus;

            /** 0=APPROVED, 2=PENDING, 3=DECLINED, 4=REFUNDED, 7=CANCELLED */
            @JsonProperty("payment_status_code")
            private Long paymentStatusCode;

            @JsonProperty("refund_amount")
            private Double refundAmount;

            @JsonProperty("total_amount")
            private Double totalAmount;

            @JsonProperty("transaction_date")
            private String transactionDate;

            public String getApv() { return apv; }
            public void setApv(String apv) { this.apv = apv; }

            public Double getDiscountAmount() { return discountAmount; }
            public void setDiscountAmount(Double v) { this.discountAmount = v; }

            public Double getOriginalAmount() { return originalAmount; }
            public void setOriginalAmount(Double v) { this.originalAmount = v; }

            public Double getPaymentAmount() { return paymentAmount; }
            public void setPaymentAmount(Double v) { this.paymentAmount = v; }

            public String getPaymentCurrency() { return paymentCurrency; }
            public void setPaymentCurrency(String v) { this.paymentCurrency = v; }

            public String getPaymentStatus() { return paymentStatus; }
            public void setPaymentStatus(String v) { this.paymentStatus = v; }

            public Long getPaymentStatusCode() { return paymentStatusCode; }
            public void setPaymentStatusCode(Long v) { this.paymentStatusCode = v; }

            public Double getRefundAmount() { return refundAmount; }
            public void setRefundAmount(Double v) { this.refundAmount = v; }

            public Double getTotalAmount() { return totalAmount; }
            public void setTotalAmount(Double v) { this.totalAmount = v; }

            public String getTransactionDate() { return transactionDate; }
            public void setTransactionDate(String v) { this.transactionDate = v; }
        }

        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class Status {
            /** 00=Success, 5=Invalid hash, 6=Not found, 8=Invalid merchant, 11=Server error */
            private String code;
            private String message;

            @JsonProperty("tran_id")
            private String tranId;

            public String getCode() { return code; }
            public void setCode(String code) { this.code = code; }

            public String getMessage() { return message; }
            public void setMessage(String message) { this.message = message; }

            public String getTranId() { return tranId; }
            public void setTranId(String tranId) { this.tranId = tranId; }
        }
    }


