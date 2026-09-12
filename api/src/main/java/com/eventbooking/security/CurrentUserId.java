package com.eventbooking.security;

import io.swagger.v3.oas.annotations.Hidden;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Injects the authenticated caller's {@code app_user.id}.
 *
 * <p>Replaces {@code @RequestHeader("X-User-Id") Long actorUserId} one-for-one.
 * That is the entire point of it being a {@code Long} rather than an
 * {@link AppUserPrincipal}: the services below every controller already take an
 * actor id, so swapping the annotation and leaving the parameter alone changes
 * where the id comes from without touching a single line of the logic that uses
 * it. A header the caller typed becomes a claim we signed.
 *
 * <p>Never null in a handler <b>unless {@link #optional()} is set</b>. If there
 * is no authentication the resolver raises a 401 rather than passing null down - a controller that receives null would
 * hand it to {@code OrganizerResolver}, which would look up "the organiser whose
 * user id is null", find nothing, and report 403 NOT_AN_ORGANIZER. That answer
 * is wrong and the wrong shape: the caller is not forbidden, they are
 * unauthenticated, and the fix is to sign in rather than to ask for access.
 *
 * <p>{@code @Hidden} keeps it out of the OpenAPI document. It is filled from the
 * {@code Authorization} header, which {@code OpenApiConfig} already describes as
 * a security scheme; listing it again as a parameter would put a box in Swagger
 * UI that a caller cannot usefully fill in.
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Hidden
public @interface CurrentUserId {

    /**
     * When true, an anonymous caller yields {@code null} instead of a 401.
     *
     * <p>For the handful of reads that are legitimately public but show MORE to
     * someone signed in - a draft event's zones are hidden from the world and
     * visible to the organiser who owns them. Those endpoints are in
     * {@code SecurityConfig.PUBLIC_GETS}, so the filter chain lets an anonymous
     * request through and the decision has to be made here, with an actor that
     * may or may not exist.
     *
     * <p>Leave it false everywhere else. A handler that takes an optional actor
     * and then forgets to branch on null is how a guard silently stops
     * guarding.
     */
    boolean optional() default false;
}
