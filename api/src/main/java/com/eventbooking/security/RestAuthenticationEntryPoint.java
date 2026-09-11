package com.eventbooking.security;

import com.eventbooking.security.error.NotAuthenticatedException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerExceptionResolver;

/**
 * What an unauthenticated caller gets when the rules refuse them.
 *
 * <p>Spring's default entry point for a stateless chain answers <b>403</b> with
 * an HTML error page. Both halves are wrong for this API. The status is wrong
 * because 403 means "I know who you are and you may not"; the truth here is 401,
 * "I do not know who you are" - and a client that cannot tell those apart cannot
 * know that refreshing its token is the fix, so it reports a permission error
 * and gives up while holding a perfectly refreshable session. The body is wrong
 * because every other failure in this application is a JSON problem document,
 * and a client parsing one shape should not meet HTML on the path it hits most.
 *
 * <p><b>Why it delegates instead of writing the JSON itself.</b> Serialising
 * here would mean an {@code ObjectMapper} of its own - which Boot 4 no longer
 * exposes as a bean anyway - configured to match the one MVC uses. Two mappers
 * is two chances to drift, and the first symptom of drift would be a 401 whose
 * timestamp serialises differently from every other error in the API. Handing
 * the exception to the same {@code HandlerExceptionResolver} the dispatcher uses
 * puts it through {@code GlobalExceptionHandler}, so a 401 raised here and a 401
 * raised inside a controller are the same document by construction.
 */
@Component
public class RestAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final HandlerExceptionResolver resolver;

    public RestAuthenticationEntryPoint(
            @Qualifier("handlerExceptionResolver") HandlerExceptionResolver resolver) {
        this.resolver = resolver;
    }

    @Override
    public void commence(HttpServletRequest request,
                         HttpServletResponse response,
                         AuthenticationException authException) {

        // Deliberately one exception for a missing token, an expired one and a
        // forged one. The caller's next move is identical in all three, and
        // naming which it was tells a guesser which attempt was closer.
        resolver.resolveException(request, response, null, new NotAuthenticatedException());
    }
}
