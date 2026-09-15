package com.eventbooking.service.Organizer;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.dto.booking.OrganizerTransactionResponse;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.model.OrganizerProfile;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.OrganizerProfileRepository;
import com.eventbooking.service.booking.OrganizerTransactionService;
import com.eventbooking.service.event.EventService;
import com.eventbooking.service.notification.telegram.TelegramMessages;
import com.eventbooking.service.notification.telegram.TelegramNotifier;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * "Connect Telegram" - the one-time deep-link handshake that turns an
 * organiser's {@code @handle} (typed into a form, useless for actually
 * messaging them) into a {@code telegram_chat_id} (learned from Telegram
 * itself, once they have messaged the bot) - and everything the bot can do
 * for a chat once that handshake is done.
 *
 * <p>Two directions meet here. {@link #connectLink} is the organiser-facing
 * half, called from their own authenticated dashboard session. {@link
 * #handleWebhookUpdate} is the reverse: an unauthenticated call FROM
 * Telegram, carrying nothing but a chat id and whatever the organiser typed -
 * so every branch in it starts from "which organiser, if any, does this chat
 * belong to" rather than trusting anything in the payload.
 */
@Service
@Slf4j
public class OrganizerTelegramService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
    /** 24 random bytes -> 32 base64url characters, well under Telegram's 64-char start-param limit. */
    private static final int TOKEN_BYTES = 24;
    private static final Duration CONNECT_TTL = Duration.ofMinutes(10);
    private static final Set<BookingStatus> REVENUE_STATES = EnumSet.of(BookingStatus.CONFIRMED);
    private static final Pattern START_COMMAND = Pattern.compile("^/start\\s+(\\S+)");
    /** Per event, per /stats reply. See TelegramMessages#eventStatsMessage on why this is not "all of them". */
    private static final int TRANSACTIONS_SHOWN = 5;

    private final OrganizerProfileRepository organizerProfileRepository;
    private final BookingRepository bookingRepository;
    private final EventService eventService;
    private final OrganizerTransactionService organizerTransactionService;
    private final TelegramNotifier telegram;
    private final String botUsername;

    public OrganizerTelegramService(OrganizerProfileRepository organizerProfileRepository,
                                    BookingRepository bookingRepository,
                                    EventService eventService,
                                    OrganizerTransactionService organizerTransactionService,
                                    TelegramNotifier telegram,
                                    com.eventbooking.config.TelegramProperties telegramProperties) {
        this.organizerProfileRepository = organizerProfileRepository;
        this.bookingRepository = bookingRepository;
        this.eventService = eventService;
        this.organizerTransactionService = organizerTransactionService;
        this.telegram = telegram;
        this.botUsername = telegramProperties.botUsername();
    }

    /**
     * Mints a fresh, 10-minute deep link and returns it. Regenerating simply
     * overwrites whatever token was already there - there is nothing to
     * revoke first, since only the newest one is ever looked up.
     *
     * @return {@code null} if the bot has no username configured, which the
     *         controller turns into a clear "not set up yet" rather than a
     *         link that opens to nothing.
     */
    @Transactional
    public String connectLink(Long organizerId) {
        if (botUsername == null || botUsername.isBlank()) return null;

        OrganizerProfile profile = organizerProfileRepository.findById(organizerId)
                .orElseThrow(() -> new IllegalStateException("organizer_profile " + organizerId + " not found"));

        byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        String token = ENCODER.encodeToString(bytes);

        profile.setTelegramConnectToken(token);
        profile.setTelegramConnectExpiresAt(Instant.now().plus(CONNECT_TTL));
        organizerProfileRepository.save(profile);

        return "https://t.me/" + botUsername + "?start=" + token;
    }

    public boolean isConnected(Long organizerId) {
        return organizerProfileRepository.findById(organizerId)
                .map(p -> p.getTelegramChatId() != null)
                .orElse(false);
    }

    @Transactional
    public void disconnect(Long organizerId) {
        organizerProfileRepository.findById(organizerId).ifPresent(p -> {
            p.setTelegramChatId(null);
            organizerProfileRepository.save(p);
        });
    }

    /**
     * One incoming Telegram update. Never throws past this method - the
     * caller is a public, unauthenticated endpoint, and the one thing worse
     * than failing to process an update is turning a malformed one into a
     * 500 that makes Telegram retry it forever.
     *
     * <p>Reads the raw update {@code Map} by hand rather than binding it to a
     * DTO - see {@code TelegramWebhookController} for why: this is the one
     * field this app has ever needed out of Telegram's much larger Update
     * schema, and a full binding would document a contract nobody reads.
     */
    @Transactional
    @SuppressWarnings("unchecked")
    public void handleWebhookUpdate(Map<String, Object> update) {
        try {
            Map<String, Object> message = (Map<String, Object>) update.get("message");
            if (message == null) return;

            Map<String, Object> chat = (Map<String, Object>) message.get("chat");
            Object rawChatId = chat == null ? null : chat.get("id");
            if (rawChatId == null) return;
            String chatId = String.valueOf(rawChatId);

            String text = String.valueOf(message.getOrDefault("text", ""));

            Matcher start = START_COMMAND.matcher(text.trim());
            if (start.find()) {
                connect(start.group(1), chatId);
                return;
            }

            organizerProfileRepository.findByTelegramChatId(chatId)
                    .ifPresent(profile -> onCommand(profile, text.trim()));
        } catch (RuntimeException e) {
            // Same posture as TelegramNotifier: this runs off a webhook, not
            // inside a user's request, so there is nobody waiting on an error
            // response and nothing gained by propagating one.
            log.warn("Could not process Telegram webhook update: {}", e.getMessage());
        }
    }

    /** {@code /start <token>}: redeem it, or say nothing if it is wrong or has expired. */
    private void connect(String token, String chatId) {
        organizerProfileRepository
                .findByTelegramConnectTokenAndTelegramConnectExpiresAtAfter(token, Instant.now())
                .ifPresentOrElse(profile -> {
                    profile.setTelegramChatId(chatId);
                    profile.setTelegramConnectToken(null);
                    profile.setTelegramConnectExpiresAt(null);
                    organizerProfileRepository.save(profile);
                    telegram.sendToChat(chatId,
                            "✅ <b>Connected!</b> You'll be notified here when your events are "
                                    + "approved and when tickets sell. Send /stats any time to see how "
                                    + "your events are doing.");
                }, () -> log.info("Telegram /start with an unknown or expired token"));
    }

    /** Anything from an already-connected chat that is not /start. Just /stats for now. */
    private void onCommand(OrganizerProfile profile, String text) {
        if (text.startsWith("/stats")) {
            sendStats(profile.getId());
        }
        // Anything else: no reply. A bot that answers every stray message a
        // person sends a friend in the same client trains them to expect a
        // conversation this is not built to have.
    }

    /**
     * One Telegram message per event, each with that event's own sold/revenue
     * summary and its own recent transactions - not one message combining
     * every event, which is unreadable past two or three of them and gives no
     * way to tell which numbers belong to which show.
     */
    private void sendStats(Long organizerId) {
        String chatId = organizerProfileRepository.findById(organizerId)
                .map(OrganizerProfile::getTelegramChatId)
                .orElse(null);
        if (chatId == null) return;

        List<EventResponse> events = eventService.listForOrganizer(organizerId, null);
        if (events.isEmpty()) {
            telegram.sendToChat(chatId, TelegramMessages.noEvents());
            return;
        }

        Map<Long, Long> revenueByEvent = bookingRepository.sumRevenueByEvent(REVENUE_STATES).stream()
                .collect(Collectors.toMap(r -> (Long) r[0], r -> ((Number) r[1]).longValue()));

        boolean sentAny = false;
        for (EventResponse e : events) {
            // CONFIRMED only - a pending hold, an expired one, a failed
            // payment are not a sale, and /stats is "how are my sales doing"
            // read on a phone, not a debug view of the booking table.
            var txnPage = organizerTransactionService.listForOrganizer(
                    organizerId, e.id(), BookingStatus.CONFIRMED, 0, TRANSACTIONS_SHOWN);
            // An event with nobody having bought anything yet is not news -
            // /stats is "how are my sales doing", and a wall of zeroes for
            // every unsold event just pushes the ones that DID sell further
            // down the chat.
            if (txnPage.getTotalElements() == 0) continue;

            var stat = new TelegramMessages.EventStat(
                    e.titleEn(),
                    e.totalSold() == null ? 0 : e.totalSold(),
                    e.totalCapacity() == null ? 0 : e.totalCapacity(),
                    revenueByEvent.getOrDefault(e.id(), 0L));
            List<TelegramMessages.TransactionLine> lines = txnPage.getContent().stream()
                    .map(this::toLine)
                    .toList();

            telegram.sendToChat(chatId,
                    TelegramMessages.eventStatsMessage(stat, lines, (int) txnPage.getTotalElements()));
            sentAny = true;
        }

        if (!sentAny) {
            telegram.sendToChat(chatId, TelegramMessages.noSalesYet());
        }
    }

    private TelegramMessages.TransactionLine toLine(OrganizerTransactionResponse t) {
        return new TelegramMessages.TransactionLine(
                t.bookingRef(),
                t.buyerName(),
                t.buyerPhoneE164(),
                t.paymentProvider(),
                String.valueOf(t.state()),
                t.totalUsdCents() == null ? 0 : t.totalUsdCents(),
                t.createdAt());
    }
}
