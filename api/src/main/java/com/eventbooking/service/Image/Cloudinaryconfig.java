package com.eventbooking.service.Image;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

@Configuration
public class Cloudinaryconfig {

	@Value("${app.cloudinary.cloud-name}")
	private String cloudName;

	@Value("${app.cloudinary.api-key}")
	private String apiKey;

	@Value("${app.cloudinary.api-secret}")
	private String apiSecret;

	@Value("${app.cloudinary.secure}")
	private boolean secure;

	@Bean
	public Cloudinary cloudinary() {
		require(cloudName, "CLOUDINARY_CLOUD_NAME");
		require(apiKey, "CLOUDINARY_API_KEY");
		require(apiSecret, "CLOUDINARY_API_SECRET");

		return new Cloudinary(ObjectUtils.asMap(
				"cloud_name", cloudName,
				"api_key", apiKey,
				"api_secret", apiSecret,
				"secure", secure));
	}

	private static void require(String value, String envVar) {
		if (!StringUtils.hasText(value)) {
			throw new IllegalStateException(
					envVar + " is not set. Copy api/.env.example to api/.env and fill in the "
							+ "Cloudinary credentials from https://console.cloudinary.com.");
		}
	}

}
