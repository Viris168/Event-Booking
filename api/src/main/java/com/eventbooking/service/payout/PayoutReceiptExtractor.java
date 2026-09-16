package com.eventbooking.service.payout;

import com.eventbooking.config.ReceiptExtractionProperties;
import com.eventbooking.dto.payout.ExtractedReceiptResponse;
import com.eventbooking.exception.image.EmptyUploadException;
import com.eventbooking.exception.image.FileTooLargeException;
import com.eventbooking.exception.image.UnsupportedFileTypeException;
import com.eventbooking.exception.payout.ReceiptExtractionFailedException;
import com.eventbooking.exception.payout.ReceiptExtractionUnavailableException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Reads a bank transfer confirmation screenshot and returns what it said.
 *
 * <p><b>Nothing is stored.</b> The upload is held in memory for the length of
 * one request, base64-encoded, posted to the vision provider, and dropped when
 * the method returns - there is no repository here, no Cloudinary call, and no
 * temp file. That is the whole design: the platform wants the fifteen
 * characters of a transaction id, not a filing cabinet of other people's bank
 * screenshots, which is a category of data that is expensive to hold and
 * embarrassing to leak.
 *
 * <p>The consequence worth stating plainly is that this is <b>not evidence</b>.
 * A stored screenshot could be re-read later by a human; a discarded one cannot,
 * so the only durable record of the transfer remains {@code paid_reference} -
 * exactly as it was before this class existed. The admin is still the one
 * asserting that money moved. This only saves them retyping it.
 *
 * <p>Failure is never fatal to the flow it serves. Every path out of here that
 * is not a clean answer raises something the transfer dialog knows how to turn
 * into "read it yourself and type it", because the text field this replaces is
 * still sitting on the same form.
 */
@Component
@Slf4j
public class PayoutReceiptExtractor {

    /**
     * What the model is asked for, and the one rule it gets wrong unprompted.
     *
     * <p>Cambodian bank confirmations routinely print both a "Reference #" and
     * a "Transaction ID" / "Trx. ID", and it is the transaction id the bank's
     * own support desk will ask for when an organiser rings up to say the money
     * never arrived. A model left to choose picks whichever is printed more
     * prominently, which varies by bank and by app version, so the preference
     * is stated rather than hoped for.
     */
    private static final String PROMPT = """
            This is a payment confirmation form. It may be short (a few rows)
            or long (many rows) - the layout varies. Extract:
            amount, date, referenceNumber, payerName.
            IMPORTANT: For 'referenceNumber', if the image contains both a \
            'Transaction ID' (Trx. ID) and a 'Reference #', you MUST extract \
            the 'Transaction ID' (Trx. ID) instead of the Reference #.
            Return ONLY valid JSON. Use null for any field not present.
            """;

    /**
     * What the provider will actually decode.
     *
     * <p>Checked against the declared content type rather than the filename,
     * unlike {@code FileUploadUtil}: that class guards uploads whose name
     * becomes part of a Cloudinary public_id, and this one has no name to
     * protect because the bytes are never given one. HEIC is absent on purpose -
     * the browser re-encodes to JPEG on its way here, so a HEIC arriving at
     * this endpoint means the client skipped that step and the provider would
     * reject it a second later anyway.
     */
    private static final Set<String> ACCEPTED =
            Set.of("image/jpeg", "image/png", "image/webp");

    private final ReceiptExtractionProperties properties;
    private final ObjectMapper objectMapper;
    private final RestClient client;

    public PayoutReceiptExtractor(ReceiptExtractionProperties properties,
                                  ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        int ms = (int) properties.timeout().toMillis();
        factory.setConnectTimeout(ms);
        factory.setReadTimeout(ms);
        this.client = RestClient.builder()
                .baseUrl(properties.baseUrl())
                .requestFactory(factory)
                .build();

        if (!properties.enabled()) {
            // Once at boot, like TelegramNotifier. A deployment that never
            // wanted this should not have its logs filled by the fact.
            log.info("Receipt extraction is off - set RECEIPT_EXTRACTION_API_KEY to turn it on. "
                    + "Admins will type the bank reference by hand.");
        }
    }

    /** Whether the transfer dialog should offer a drop zone at all. */
    public boolean enabled() {
        return properties.enabled();
    }

    /**
     * @param image a transfer confirmation screenshot, never persisted
     * @return whatever the model read, every field nullable
     * @throws ReceiptExtractionUnavailableException on a deployment with no key
     * @throws ReceiptExtractionFailedException      if the provider could not be
     *                                               reached or did not answer
     *                                               with the JSON it was asked
     *                                               for
     */
    public ExtractedReceiptResponse extract(MultipartFile image) {
        if (!properties.enabled()) {
            throw new ReceiptExtractionUnavailableException();
        }

        assertReadable(image);

        String base64;
        try {
            base64 = Base64.getEncoder().encodeToString(image.getBytes());
        } catch (IOException e) {
            // The multipart never fully arrived. Nothing was sent anywhere.
            throw new ReceiptExtractionFailedException("the upload could not be read");
        }

        Map<String, Object> body = Map.of(
                "contents", List.of(Map.of(
                        "parts", List.of(
                                Map.of("text", PROMPT),
                                Map.of("inline_data", Map.of(
                                        "mime_type", image.getContentType(),
                                        "data", base64))))),
                // Zero temperature because this is transcription, not writing:
                // there is one correct answer printed on the image and nothing
                // is gained by sampling around it. The mime type makes the
                // provider emit bare JSON rather than a fenced code block, so
                // the parse below has no markdown to strip.
                "generationConfig", Map.of(
                        "temperature", 0.0,
                        "response_mime_type", "application/json"));

        String raw;
        try {
            raw = client.post()
                    // The key travels as a header, not as ?key= in the query
                    // string. Query strings end up in access logs, proxy logs
                    // and error reports; this one would be a live credential in
                    // all three.
                    .uri("/{model}:generateContent", properties.model())
                    .header("x-goog-api-key", properties.apiKey())
                    .body(body)
                    .retrieve()
                    .body(String.class);
        } catch (RestClientException e) {
            // Deliberately not logging the exception body: a provider error can
            // echo the request back, and the request contains the screenshot.
            log.warn("Receipt extraction call failed: {}", e.getClass().getSimpleName());
            throw new ReceiptExtractionFailedException("the service did not answer");
        }

        return parse(raw);
    }

    /**
     * Refuses what the provider would refuse, before spending a call on it.
     *
     * <p>Reuses the image-upload exceptions rather than inventing payout-shaped
     * ones: "that file is too big" is the same sentence to the same person
     * whether the file was going to Cloudinary or to a vision model.
     */
    private void assertReadable(MultipartFile image) {
        if (image == null || image.isEmpty()) {
            throw new EmptyUploadException();
        }
        if (image.getSize() > properties.maxBytes()) {
            throw new FileTooLargeException(image.getSize(), properties.maxBytes());
        }
        String contentType = image.getContentType();
        if (contentType == null || !ACCEPTED.contains(contentType.toLowerCase())) {
            throw new UnsupportedFileTypeException(
                    "receipt", String.valueOf(contentType), "JPEG, PNG, WebP");
        }
    }

    /**
     * Digs the model's answer out of the envelope and reads it as our record.
     *
     * <p>Two layers, and they are easy to confuse. The provider returns JSON
     * describing a response; the text inside {@code candidates[0].content
     * .parts[0].text} is a second, separate JSON document - the one the prompt
     * asked for. Both can be malformed independently, and both arrive as a
     * 200.
     */
    private ExtractedReceiptResponse parse(String raw) {
        try {
            JsonNode text = objectMapper.readTree(raw)
                    .path("candidates").path(0)
                    .path("content").path("parts").path(0)
                    .path("text");

            if (text.isMissingNode() || !text.isTextual() || text.asText().isBlank()) {
                // Reached when the model declined - a safety block or a finish
                // reason other than STOP both land here with no parts at all.
                throw new ReceiptExtractionFailedException("nothing was read from the image");
            }

            JsonNode fields = objectMapper.readTree(text.asText());

            return new ExtractedReceiptResponse(
                    textOrNull(fields, "amount"),
                    textOrNull(fields, "date"),
                    textOrNull(fields, "referenceNumber"),
                    textOrNull(fields, "payerName"));

        } catch (ReceiptExtractionFailedException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Receipt extraction returned unparseable content: {}", e.getClass().getSimpleName());
            throw new ReceiptExtractionFailedException("the answer was not readable");
        }
    }

    /**
     * A JSON null, an absent key and the four characters {@code "null"} all
     * mean the same thing here - the field was not on the receipt - and the
     * prompt asks for the first while models routinely produce the third.
     */
    private static String textOrNull(JsonNode fields, String name) {
        JsonNode node = fields.path(name);
        if (node.isMissingNode() || node.isNull() || !node.isValueNode()) {
            return null;
        }
        String value = node.asText().trim();
        return value.isEmpty() || value.equalsIgnoreCase("null") ? null : value;
    }
}
