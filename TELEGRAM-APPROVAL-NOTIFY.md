# Plan: Telegram notification on event approval, ticket sales, and stats

**Status:** planned, not started — build tomorrow.
**Branch:** off `main` (7 commits currently ahead of `origin/main`, pushed to
`origin/test-push` for review).

## Why

Approving an event today only writes an in-app notification. The organiser
should also get pinged on Telegram directly.

That isn't possible with just the `@handle` organisers type into their
application — a bot can only message a chat that has *already messaged the
bot first*. The schema already has the right column for this
(`organizer_profile.telegram_chat_id`), but nothing has ever populated it —
every write site sets it `null` with a comment saying the connect flow
doesn't exist yet. This plan builds that connect flow, then wires Approve to
use it.

A working prototype of this exact pattern already exists at
`/home/viris/Documents/Java/Project/telegrambot/telegrambot/` (separate
demo repo) — proves the flow works. This plan ports it into the real app
instead of running it as a second service (see "Deployment" below for why).

## How it works, end to end

1. Organiser clicks **Connect Telegram** on their dashboard → backend mints a
   short-lived random token, stores it on their `organizer_profile` row,
   returns a deep link `https://t.me/<bot>?start=<token>`.
2. Organiser opens the link, presses **Start** in Telegram.
3. Telegram POSTs the resulting message to our webhook. The webhook reads
   the token back out of `/start <token>`, matches it to the organiser, and
   saves the chat's numeric id into `organizer_profile.telegram_chat_id`.
   The token is single-use — cleared immediately after.
4. From then on, whenever `NotificationListener` handles an `APPROVE`
   transition, it also checks that organiser's `telegram_chat_id`; if set,
   it sends them a Telegram message the same way `eventSubmitted` already
   messages the admin channel today.
5. Same connection covers ticket sales too: `onBookingStateChanged` already
   writes an in-app "tickets sold" notification to the organiser on every
   `CONFIRMED` booking — the same `sendToChat` gets called there.
6. The organiser can also *ask* the bot something, not just receive pushes:
   sending `/stats` in the connected chat gets a reply with a per-event
   sold/revenue/average breakdown, computed the same way the organiser
   dashboard and admin overview already do (see "Bot commands" below).

## Backend changes

**Migration** `api/src/main/resources/db/migration/V28__organizer_telegram_connect.sql`:
```sql
ALTER TABLE organizer_profile
  ADD COLUMN telegram_connect_token TEXT,
  ADD COLUMN telegram_connect_expires_at TIMESTAMPTZ;
CREATE UNIQUE INDEX uq_organizer_profile_telegram_token
  ON organizer_profile (telegram_connect_token) WHERE telegram_connect_token IS NOT NULL;
```
`telegram_chat_id` needs no migration — it's existed since V1, just always
written `null` (`OrganizerServiceimpl.java:147`, `AdminUserService.java:316`,
`DatabaseSeeder.java:121`).

| File | Change |
|---|---|
| `OrganizerProfile.java` | add `telegramConnectToken` / `telegramConnectExpiresAt` fields |
| `OrganizerProfileRepository.java` | add `findByTelegramConnectTokenAndTelegramConnectExpiresAtAfter(token, now)` |
| `TelegramProperties.java` | add `botUsername`, `webhookSecret` + `webhookConfigured()` |
| `TelegramNotifier.java` | add `sendToChat(chatId, html)` alongside the existing fixed-admin-chat `send(html)` |
| `TelegramMessages.java` | add `eventApproved(event, km)` — short, organiser-facing, EN/KM |
| `OrganizerTelegramService` (new) | `connectLink()`, `handleWebhookUpdate()`, `disconnect()`, `isConnected()` |
| `OrganizerTelegramController` (new) | `/api/v1/organizer/telegram/{connect-link,status,disconnect}` — already covered by the existing `/api/v1/organizer/**` security rule, no new auth work |
| `TelegramWebhookController` (new) | `POST /api/v1/telegram/webhook` — the one new *public* endpoint, guarded by Telegram's own `X-Telegram-Bot-Api-Secret-Token` header instead of a JWT. One new `permitAll` line in `SecurityConfig.java` for this path only |
| `NotificationListener.onEventReviewed` | on `APPROVE`, if `telegram_chat_id` is set, send the approval message. Silent no-op otherwise — nothing regresses for organisers who never connect |
| `NotificationListener.onBookingStateChanged` | same idea, next to the existing in-app `EVENT_TICKETS_SOLD` write for `CONFIRMED` bookings: if the organiser's `telegram_chat_id` is set, send them a "🎟 Ticket sold — [event], [ref], $[amount]" message |
| `TelegramMessages.ticketSold(event, booking)` (new) | short organiser-facing template, same EN/KM shape as `eventApproved` |

## Bot commands — `/stats`

Beyond push notifications, the organiser can message the bot back. The
webhook already receives every message they send once connected; this adds
one more branch to it alongside the existing `/start <token>` handling.

| File | Change |
|---|---|
| `OrganizerProfileRepository.java` | add `findByTelegramChatId(String chatId)` — the reverse lookup: given an incoming message's chat id, whose organiser is this? |
| `OrganizerTelegramService.handleWebhookUpdate` | if the text is `/start ...` → existing connect flow. Else, look up the organiser by chat id; if found and the text is `/stats` (or unrecognized), reply with the stats summary (or a short "try /stats" hint). If the chat id matches no organiser at all, ignore silently — nothing here should ever reply to a stranger |
| `OrganizerTelegramService.statsFor(organizerId)` (new) | pulls the organiser's own events via the same query `OrganizerController.listForOrganizer` already uses, plus a revenue-by-event sum scoped to those events (same shape as `AdminEventOverviewService`'s `bookingRepository.sumRevenueByEvent`, just filtered to one organiser instead of all) |
| `TelegramMessages.organizerStats(events, revenueByEvent)` (new) | formats the per-event list — title, sold/capacity, revenue, average ticket price, then a total across all events |

Sample reply:
```
📊 Your events

Kon cert
Sold: 30/60 (50%)
Revenue: $150.00 · avg $5.00/ticket

Dev Show 2026
Sold: 46/550 (8%)
Revenue: $4.60 · avg $0.10/ticket

Total revenue: $154.60
```

Deliberately just one command for now (`/stats`), not a menu of subcommands
or inline buttons — that's an easy follow-up once this shape is proven, not
something to build speculatively upfront.

## Frontend changes

| File | Change |
|---|---|
| `web/src/api/organizer.js` | `getTelegramStatus()`, `getTelegramConnectLink()`, `disconnectTelegram()` |
| `TelegramConnectCard.jsx` (new) | modeled on `AccountPanel.jsx`'s existing Google link/unlink card (~line 733-865). Connected: Disconnect behind a confirm dialog. Not connected: the deep link + a "Check again" button (no OAuth callback to hook into, so no auto-detect) |
| `OrganizerDashboardPage.jsx` | render the card near the top, above "My events" |

## Deployment — this is *not* a separate server

The standalone demo project's `DEPLOYMENT.md` (Nginx + Certbot + systemd,
its own domain) does not apply here. Production already runs as Docker
Compose (`deploy/docker-compose.prod.yml`) with Caddy handling TLS
automatically, and **Caddy already proxies all of `/api/*` to the `api`
container** (`deploy/Caddyfile`) — so `/api/v1/telegram/webhook` needs zero
new routing, zero new domain, zero new TLS cert. Building this as a second
app on the VPS would mean duplicating all of that just to talk to data
(organizers, events, approvals) that already lives in the real app's own
database.

Shipping it uses the pipeline that already exists
(`.github/workflows/release.yml` → GHCR → `deploy/scripts/ci-deploy.sh` over
locked-down SSH) — no new deploy mechanism.

**What's actually new on the ops side:**
1. Add `TELEGRAM_BOT_USERNAME` and `TELEGRAM_WEBHOOK_SECRET` to the real
   `.env.prod` on the VPS (`TELEGRAM_BOT_TOKEN` already exists there for the
   admin-only notifications). I'll also add these two to
   `deploy/env.prod.example` in the repo so they're documented.
2. After the release deploys, one manual one-time command:
   ```bash
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     -d "url=https://<real-domain>/api/v1/telegram/webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```

## What can be verified before a real deploy

Telegram only POSTs to a public HTTPS URL — it can't reach `localhost`. Before
the VPS step, I can verify:
- The migration applies and the new columns/repository query work.
- `connect-link` / `status` end-to-end in the browser (dashboard card
  renders, link generates).
- The webhook handler's logic directly, via `curl` with a synthetic
  Telegram-shaped payload against `localhost:8080/api/v1/telegram/webhook`
  (same trick the demo project's own README uses) — confirms
  `telegram_chat_id` gets set in the DB without needing a real Telegram
  round-trip.
- `NotificationListener`'s new branches (approve, ticket sold), by driving a
  test event/booking through them for an organiser whose `telegram_chat_id`
  I've set directly in the dev DB, and confirming `sendToChat` is called
  with the right chat id and message.
- `/stats`, by POSTing a synthetic `{"message":{"chat":{"id":...},"text":"/stats"}}`
  payload at the webhook for that same organiser and checking the returned
  reply text matches their actual dev-DB events/revenue.

What needs the real deploy: an actual message landing in a real Telegram
chat — that needs the app live at the real HTTPS domain with `setWebhook`
registered and a real bot token in the VPS's `.env.prod`. That part I can't
verify from here regardless of how the code is written; everything above it
can be nailed down first.
