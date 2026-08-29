package com.eventbooking.model.ABA;

import java.util.Map;

/**
 * The signed form whose submission opens PayWay's hosted checkout, mirroring
 * the official plugin's hidden {@code aba_merchant_request} form.
 *
 * <p>{@code action} is where the browser posts the fields; {@code fields} are
 * the hidden inputs, the last of which is the HMAC-SHA512 {@code hash} the
 * merchant server signed over the rest. The API key itself never reaches the
 * browser - signing is the server's entire part in this arrangement.
 *
 * <p>Serialized to JSON and stored on the payment transaction, so a page
 * reload re-renders the same form instead of signing a second one.
 */
public class PaywayCheckoutForm {

    private String action;
    private Map<String, String> fields;

    public PaywayCheckoutForm() {
    }

    public PaywayCheckoutForm(String action, Map<String, String> fields) {
        this.action = action;
        this.fields = fields;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public Map<String, String> getFields() {
        return fields;
    }

    public void setFields(Map<String, String> fields) {
        this.fields = fields;
    }
}
