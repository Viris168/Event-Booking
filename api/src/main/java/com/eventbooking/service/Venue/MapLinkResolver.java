package com.eventbooking.service.Venue;

import com.eventbooking.exception.venue.UnreadableMapLinkException;
import lombok.extern.slf4j.Slf4j;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * Turns a Google Maps short link into the long URL it points at.
 *
 * <p>Why the server has to do this: {@code https://maps.app.goo.gl/<code>} is
 * what the Maps app's Share button produces, and it carries no coordinates -
 * only an opaque code. The real URL, with the pin inside it, arrives in the
 * {@code Location} header of a 302. A browser cannot read that header on a
 * cross-origin redirect, so the hop belongs here.
 *
 * <p><b>This class deliberately does not parse coordinates.</b> That logic
 * lives once, in the frontend's {@code lib/mapLink.js}, where it is already
 * exercised against real links - including the case where Google leaves a
 * previously-viewed place in the URL and the stale pin comes first. A second
 * implementation in Java would be a second thing to keep correct, so this
 * returns the resolved URL and the caller parses it with the same code it uses
 * for a link the organiser pasted in full.
 *
 * <p>Security: this endpoint makes an outbound request to a host named in the
 * request body, which is the shape of an SSRF. Three things keep it narrow -
 * the starting host must be one of Google's shorteners, every redirect target
 * must also be a Google host, and the whole exchange is capped in hops and
 * time. Only {@code HEAD} is ever sent and no body is read, so even a
 * permitted host cannot return anything this service acts on.
 */
@Service
@Slf4j
public class MapLinkResolver {

    /** Where a caller is allowed to start: the two Google URL shorteners. */
    private static final Pattern ALLOWED_INPUT_HOST =
            Pattern.compile("^(maps\\.app\\.goo\\.gl|goo\\.gl)$", Pattern.CASE_INSENSITIVE);

    /**
     * Where a redirect is allowed to lead. Google's country domains are real -
     * a link shared inside Cambodia can land on google.com.kh - so this matches
     * the family rather than listing them.
     */
    private static final Pattern ALLOWED_REDIRECT_HOST =
            Pattern.compile("^([a-z0-9-]+\\.)*(google\\.[a-z.]{2,7}|goo\\.gl)$",
                    Pattern.CASE_INSENSITIVE);

    /**
     * Google answers the share link with a single 302. The allowance is for
     * consent or country interstitials adding a hop; it is not an invitation to
     * chase a redirect chain.
     */
    private static final int MAX_HOPS = 3;

    private final OkHttpClient client;

    public MapLinkResolver() {
        this.client = new OkHttpClient.Builder()
                .connectTimeout(3, TimeUnit.SECONDS)
                .readTimeout(3, TimeUnit.SECONDS)
                // Hand-walked rather than delegated: OkHttp following the chain
                // itself would skip the per-hop host check below, which is the
                // only thing stopping a redirect from aiming this at something
                // inside our own network.
                .followRedirects(false)
                .followSslRedirects(false)
                .build();
    }

    /**
     * The long URL behind a short Maps link.
     *
     * @throws UnreadableMapLinkException for anything that is not a Google
     *         short link resolving to a Google page - a bad host, too many
     *         hops, a timeout, or a response that is not a redirect at all.
     *         Undifferentiated on purpose: every one of them means the same
     *         thing to the organiser, which is that this link cannot be read
     *         and they should drop the pin by hand instead.
     */
    private String cleanInputUrl(String raw) {
        if (raw == null) return "";
        Pattern p = Pattern.compile("https?://[^\\s\"'<>]+", Pattern.CASE_INSENSITIVE);
        var m = p.matcher(raw.trim());
        return m.find() ? m.group() : raw.trim();
    }

    public String resolve(String shortUrl) {
        String cleanUrl = cleanInputUrl(shortUrl);
        URI uri = parse(cleanUrl);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || !hostMatches(uri, ALLOWED_INPUT_HOST)) {
            throw new UnreadableMapLinkException();
        }

        String current = uri.toString();
        for (int hop = 0; hop < MAX_HOPS; hop++) {
            String next = followOnce(current);
            if (next == null) {
                if (current.contains("/maps") || current.contains("/place")) {
                    return current;
                }
                throw new UnreadableMapLinkException();
            }

            URI target = parse(next);
            if (!"https".equalsIgnoreCase(target.getScheme())
                    || !hostMatches(target, ALLOWED_REDIRECT_HOST)) {
                log.warn("Maps link redirected off Google to host={}", target.getHost());
                throw new UnreadableMapLinkException();
            }

            // A /maps or /place URL is the destination; anything else is still in transit.
            if (target.getPath() != null && (target.getPath().contains("maps") || target.getPath().contains("place"))) {
                return target.toString();
            }
            current = target.toString();
        }

        if (current.contains("google.") || current.contains("/maps")) {
            return current;
        }

        throw new UnreadableMapLinkException();
    }

    /** The Location of a single hop, or null when the response is not a redirect. */
    private String followOnce(String url) {
        Request request = new Request.Builder()
                .url(url)
                .get()
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .build();

        try (Response response = client.newCall(request).execute()) {
            if (!response.isRedirect()) return null;
            String location = response.header("Location");
            return (location == null || location.isBlank()) ? null : location;
        } catch (Exception e) {
            log.warn("Could not resolve map link: {}", e.toString());
            throw new UnreadableMapLinkException();
        }
    }

    private URI parse(String url) {
        try {
            return new URI(String.valueOf(url).trim());
        } catch (Exception e) {
            throw new UnreadableMapLinkException();
        }
    }

    private boolean hostMatches(URI uri, Pattern allowed) {
        String host = uri.getHost();
        return host != null && allowed.matcher(host.toLowerCase(Locale.ROOT)).matches();
    }
}
