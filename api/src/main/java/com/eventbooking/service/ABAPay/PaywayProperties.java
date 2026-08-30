package com.eventbooking.service.ABAPay;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "payway")
  public class PaywayProperties {

      private String baseUrl;
      private String merchantId;
      private String apiKey;
      /** MOCK or LIVE. MOCK is what registers the /api/v1/dev/payway/** endpoints. */
      private String mode = "MOCK";

      public String getMode() {
          return mode;
      }

      public void setMode(String mode) {
          this.mode = mode;
      }

      public String getBaseUrl() {
          return baseUrl;
      }

      public void setBaseUrl(String baseUrl) {
          this.baseUrl = baseUrl;
      }

      public String getMerchantId() {
          return merchantId;
      }

      public void setMerchantId(String merchantId) {
          this.merchantId = merchantId;
      }

      public String getApiKey() {
          return apiKey;
      }

      public void setApiKey(String apiKey) {
          this.apiKey = apiKey;
      }
  }