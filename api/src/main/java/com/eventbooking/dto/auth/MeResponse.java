package com.eventbooking.dto.auth;

import com.eventbooking.Enumeration.Role;
import com.eventbooking.model.AppUser;
import com.eventbooking.model.OrganizerProfile;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Who the bearer of this token is.
 *
 * <p>{@link TokenResponse} hands back credentials and nothing else, which is
 * correct - but it leaves a client with no idea whose credentials they are. The
 * access token's subject is a phone number, and a phone number is not enough to
 * render a UI: the navigation differs by {@code role}, and an organiser's pages
 * key off {@code organizer_profile.id}, which is a different id space from
 * {@code app_user.id} entirely.
 *
 * <p>A client could decode the JWT itself to read the role claim. It should not:
 * that claim is a snapshot from issue time and is unsigned as far as the client
 * can tell, so a browser that trusts it is trusting something it cannot verify.
 * This endpoint re-reads the row.
 *
 * <p>Nothing here is secret - it is the caller's own record - but note what is
 * absent: no password hash, no provider subject, no Cloudinary credentials.
 *
 * @param organizerProfileId null for a CUSTOMER, and the reason an organiser's
 *                           dashboard can ask for "my events" without first
 *                           guessing which profile is theirs
 */
public record MeResponse(

        @JsonProperty("id") Long id,

        @JsonProperty("phone_e164") String phoneE164,

        @JsonProperty("email") String email,

        @JsonProperty("display_name") String displayName,

        @JsonProperty("role") Role role,

        @JsonProperty("is_disabled") boolean isDisabled,

        @JsonProperty("image_url") String imageUrl,

        @JsonProperty("organizer_profile_id") Long organizerProfileId,

        @JsonProperty("org_name_en") String orgNameEn,

        @JsonProperty("org_name_km") String orgNameKm
) {

    public static MeResponse of(AppUser user, OrganizerProfile profile) {
        return new MeResponse(
                user.getId(),
                user.getPhoneE164(),
                user.getEmail(),
                user.getDisplayName(),
                user.getRole(),
                Boolean.TRUE.equals(user.getIsDisabled()),
                user.getCloudinaryImageId(),
                profile == null ? null : profile.getId(),
                profile == null ? null : profile.getOrgNameEn(),
                profile == null ? null : profile.getOrgNameKm());
    }
}
