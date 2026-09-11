package com.eventbooking.security;

import com.eventbooking.security.error.NotAuthenticatedException;
import org.springframework.core.MethodParameter;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * Makes {@link CurrentUserId} work: reads the principal that
 * {@link JwtAuthenticationFilter} put in the security context and hands the
 * controller its {@code app_user.id}.
 *
 * <p>This is the single place where an identity becomes an id, which is what
 * makes the change reviewable. Before, every controller took the id from a
 * header, so "can I trust this id" had to be answered fifty times; now it is
 * answered once, here, and the answer is "yes, it came out of a signature".
 */
@Component
public class CurrentUserIdArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(CurrentUserId.class)
                && Long.class.isAssignableFrom(parameter.getParameterType());
    }

    @Override
    public Long resolveArgument(MethodParameter parameter,
                                ModelAndViewContainer mavContainer,
                                NativeWebRequest webRequest,
                                WebDataBinderFactory binderFactory) {

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        // An anonymous request still carries an Authentication - Spring's
        // AnonymousAuthenticationToken - whose principal is the String
        // "anonymousUser". Checking the type rather than null-ness is what
        // separates "nobody is signed in" from "someone is", and skipping that
        // is how anonymousUser ends up cast to a principal at runtime.
        if (authentication == null || !(authentication.getPrincipal() instanceof AppUserPrincipal principal)) {
            throw new NotAuthenticatedException();
        }

        return principal.getId();
    }
}
