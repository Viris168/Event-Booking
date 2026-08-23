package com.eventbooking.service.ABAPay;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "payway")
  public class PaywayProperties {

      private String baseUrl;
      private String merchantId;
      private String apiKey;

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