# CamboBook: Master Project Documentation & Defense Dossier

> **Project Title:** CamboBook — Scalable Cambodian Event Ticketing & Concurrency Platform  
> **Repository:** `Viris168/Event-Booking`  
> **Academic Context:** ETEC Capstone / 100% Scholarship Project Defense (Year 5)  
> **Engineering Vertical Slices:**  
> - **Winner:** Booking & Payment Subsystems (Hold Conversion, Bakong KHQR, ABA PayWay, Reconciler, Ticket Issuance, Concurrency Safety)  
> - **Vireak:** Catalog, Venue & Inventory Subsystems (Physical Seat Maps, SVG Designer, Zoned/Mixed Inventory)  
> - **Sovannara:** Platform, Security & Identity (JWT & Hashed Refresh Rotation, Flyway Migrations, Telegram Bot, Admin Queue)  

---

## Table of Contents
1. [Executive Summary & Problem Space](#1-executive-summary--problem-space)
2. [End-to-End System Architecture](#2-end-to-end-system-architecture)
3. [Deep Architectural Breakdown by Vertical Lane](#3-deep-architectural-breakdown-by-vertical-lane)
   - [3.1 Inventory & Seat Map Lane](#31-inventory--seat-map-lane)
   - [3.2 The Concurrency & Anti-Overselling Engine](#32-the-concurrency--anti-overselling-engine)
   - [3.3 The Booking State Machine & Lifecycle](#33-the-booking-state-machine--lifecycle)
   - [3.4 Cambodian Payment Systems (Bakong KHQR & ABA PayWay)](#34-cambodian-payment-systems-bakong-khqr--aba-payway)
   - [3.5 Cryptographic Ticketing & Gate Turnstile Scanner](#35-cryptographic-ticketing--gate-turnstile-scanner)
   - [3.6 Security, Identity & Defenses](#36-security-identity--defenses)
   - [3.7 Telegram Bot Integration & Webhooks](#37-telegram-bot-integration--webhooks)
4. [Database Engineering: 34 Flyway Migrations & Kernel Invariants](#4-database-engineering-34-flyway-migrations--kernel-invariants)
5. [Error Handling Architecture (RFC 7807 Problem Details)](#5-error-handling-architecture-rfc-7807-problem-details)
6. [Frontend Engineering: React 19, Vite 8 & Axios Resilience](#6-frontend-engineering-react-19-vite-8--axios-resilience)
7. [DevOps, Monitoring & Production Deployment](#7-devops-monitoring--production-deployment)
8. [The Master Defense Q&A Playbook (Anticipating the Toughest Questions)](#8-the-master-defense-qa-playbook-anticipating-the-toughest-questions)
9. [Step-by-Step Live Defense Demo Script (5–7 Minutes)](#9-step-by-step-live-defense-demo-script-57-minutes)

---

## 1. Executive Summary & Problem Space

### 1.1 The Cambodian Ticketing Landscape
Event ticketing in Cambodia has historically struggled with structural deficits:
1. **Pervasive Scalping & Counterfeiting:** Event organizers rely on unverified paper tickets, Telegram chat screenshots, or static QR images that are easily duplicated, shared, and forged.
2. **High-Demand Concurrency Overselling:** When popular artists (e.g., concert drops at Diamond Island or Olympic Stadium) open ticket sales, standard web apps suffer race conditions that oversell seats, causing turnstile disputes at the door.
3. **Absence of Localized Payment Integration:** International platforms (Eventbrite, Ticketmaster) do not natively interface with National Bank of Cambodia’s **Bakong KHQR** or **ABA PayWay**, nor do they manage Cambodia's dual-currency economy (USD & KHR) without punishing foreign transaction fees.
4. **Rigid Inventory Models:** Existing software forces an event to be *either* purely assigned seating (cinema style) *or* general admission (outdoor festival style), unable to support **Mixed-Mode Events** (e.g., VIP seated tables + General Admission standing floor) within a single cart and checkout.

### 1.2 The CamboBook Solution
CamboBook is an enterprise-grade, fullstack event booking platform specifically engineered for Cambodia's digital infrastructure:
- **Unified Inventory:** Accommodates `SEATED`, `ZONED` (General Admission), and `MIXED` ticket models in a unified cart.
- **Fail-Safe Concurrency:** Implements a hybrid locking architecture (JPA `@Version` optimistic locking for individual seats + pessimistic `SELECT ... FOR UPDATE` with deterministic ID ordering for general admission zones) backed by hardware-grade PostgreSQL partial unique indexes.
- **Cambodian Payment Sovereignty:** Native integration with **Bakong KHQR** (EMVCo dynamic payload generation, mobile deep links, background polling reconciler) and **ABA PayWay** (HMAC-SHA512 signed checkouts and instant webhook callbacks), featuring a **frozen FX rate (USD/KHR)** locked at booking time.
- **Tamper-Proof Ticketing:** Cryptographically signed QR codes (`EBT1.<ticketId>.<uuid>.<hmacSha256[:16]>`) verified in constant time, coupled with a mobile turnstile check-in web application that enforces atomic single-use gate admittance.
- **Operational Lifecycle:** Complete multi-role platform with venue SVG layout designers, admin moderation queues, Telegram bot push alerts & `/stats` inquiries, and organizer commission settlements with printable invoices.

---

## 2. End-to-End System Architecture

```
+───────────────────────────────────────────────────────────────────────────────────+
|                                  CLIENT TIER                                      |
|    React 19 + Vite 8 SPA | React Router 7 | Tailwind CSS v4 | ECharts | Leaflet   |
|            - Customer Portal: Discovery, Interactive Seat Map, Wallet             |
|            - Organizer Portal: SVG Seat Map Designer, Sales, Telegram, Payouts    |
|            - Admin Portal: Review Queue, Applications, Payment Audit, Invoices    |
|            - Gate Turnstile App: Real-Time Mobile Camera QR Scanner               |
+───────────────────────────────────────────────────────────────────────────────────+
                                          │
                                          │ HTTPS / JSON REST API
                                          ▼
+───────────────────────────────────────────────────────────────────────────────────+
|                           INGRESS & REVERSE PROXY                                 |
|            Caddy 2 (Automatic TLS via Let's Encrypt, Single-Origin Proxy)         |
|            - Routes /api/* directly to Spring Boot backend                        |
|            - Serves React SPA static assets directly via internal cache           |
|            - Eliminates Cross-Origin Resource Sharing (CORS) vulnerabilities      |
+───────────────────────────────────────────────────────────────────────────────────+
                                          │
                                          │ Forwarded Headers (Proxy Protocol)
                                          ▼
+───────────────────────────────────────────────────────────────────────────────────+
|                       APPLICATION TIER (SPRING BOOT 4.1 / JAVA 21)               |
|                                                                                   |
|  [Security & Identity]      [Inventory & Catalog]       [Hold & Booking Engine]   |
|  - Deny-by-default filter   - Venue physical layouts    - 10-minute hold TTL      |
|  - 15-min JWT access token  - Seat class price tiers    - BookingStateMachine     |
|  - SHA-256 hashed refresh   - General admission zones   - Optimistic & Pessimistic|
|  - Pre-BCrypt rate limiter  - Mixed event triggers      - Deadlock prevention     |
|                                                                                   |
|  [Cambodian Payments]       [Ticketing & Gate]          [Integrations & Ops]      |
|  - Bakong KHQR EMVCo Gen    - HMAC-SHA256 Signed QR     - Telegram Bot Webhooks   |
|  - ABA PayWay SHA-512 Form  - Constant-time verification- Real-time push alerts   |
|  - Frozen FX rate (USD/KHR) - Gate concurrency lock     - Cloudinary Media CDN    |
|  - Polling Reconciler Daemon- ScanLog audit trail       - Prometheus Actuator     |
+───────────────────────────────────────────────────────────────────────────────────+
                                          │
                                          │ HikariCP Connection Pool (Max: 20)
                                          ▼
+───────────────────────────────────────────────────────────────────────────────────+
|                         DATA TIER (POSTGRESQL 16)                                 |
|  - 34 Versioned Flyway Migrations (Single Source of Truth, ddl-auto: validate)    |
|  - Declarative PostgreSQL CHECK Constraints & Custom Trigger Functions           |
|  - Partial Unique Indexes for Double-Booking & Double-Charge Elimination          |
|  - Relational Integrity (Foreign Keys, Cascades, SET NULL Rules)                  |
+───────────────────────────────────────────────────────────────────────────────────+
```

---

## 3. Deep Architectural Breakdown by Vertical Lane

### 3.1 Inventory & Seat Map Lane
- **Physical vs Event-Specific Decoupling:**
  - `venue` and `venue_seat` define the physical geometry of an auditorium (labels, row labels, X/Y coordinates).
  - When an event is published, physical seats are materialized into `event_seat` rows linked to a `seat_class` (pricing tier).
- **Supported Inventory Modes:**
  1. `SEATED`: Assigned seat rows materialized from physical venues.
  2. `ZONED`: General admission capacity buckets (`event_zone`) tracking `capacity`, `held_qty`, and `sold_qty`.
  3. `MIXED`: Combines both physical seat rows and standing capacity zones in a single event.
- **Database Trigger Guards:**
  - `trg_guard_seat_class`: Refuses seat class creation unless mode is `SEATED` or `MIXED`.
  - `trg_guard_event_zone`: Refuses zone creation unless mode is `ZONED` or `MIXED`.
  - `trg_guard_mode_change`: Prevents organizers from altering inventory mode if incompatible inventory items already exist.

---

### 3.2 The Concurrency & Anti-Overselling Engine
The defining engineering achievement of CamboBook is its **guaranteed anti-overselling concurrency engine**.

```
   User 1 (Requests 2 Zone Tickets)           User 2 (Requests 2 Zone Tickets)
                 │                                          │
                 ▼                                          ▼
        POST /api/v1/holds                         POST /api/v1/holds
                 │                                          │
        ┌─────────────────┐                        ┌─────────────────┐
        │ Begin @Tx (U1)  │                        │ Begin @Tx (U2)  │
        └─────────────────┘                        └─────────────────┘
                 │                                          │
      SELECT FOR UPDATE (Zone #4)                SELECT FOR UPDATE (Zone #4)
      [Lock Acquired Immediately]                [Blocked: Waiting for Lock]
                 │                                          ░
      Check Capacity:                                       ░
      held(8) + sold(10) + req(2) <= 20 (OK)                ░
      held_qty updated: 8 -> 10                             ░
                 │                                          ░
        ┌─────────────────┐                                 ░
        │ Commit @Tx (U1) │                                 ░
        └─────────────────┘                                 ░
                 │ (Lock Released) ────────────────────────►│ [Lock Acquired]
                 ▼                                          │
          201 Created (Hold)                                Check Capacity:
                                                            held(10) + sold(10) + req(2) <= 20
                                                            22 <= 20 (VIOLATION)
                                                            Rollback Transaction
                                                                    │
                                                                    ▼
                                                            409 Conflict (Sold Out)
```

#### Hybrid Locking Architecture
1. **Assigned Seats (`EventSeat`) — Optimistic Locking (`@Version`):**
   - High item volume, sparse contention.
   - An integer `@Version` column is incremented on status update (`AVAILABLE` $\to$ `HELD`).
   - If two users race for the exact same seat coordinate, one commits and the second triggers an `ObjectOptimisticLockingFailureException`, translated cleanly to `409 Conflict: Seat unavailable`.
2. **General Admission Zones (`EventZone`) — Pessimistic Row Locking (`SELECT ... FOR UPDATE`):**
   - Counter-based inventory with high contention during sales bursts.
   - Using optimistic locking would cause 90%+ rollback churn.
   - Handled via `lockZonesOf()` in `HoldServiceimpl`: requests line up in a queue and are evaluated sequentially.
3. **Deadlock Freedom Guarantee:**
   - In `lockZonesOf()`, zone IDs are always deduplicated and sorted numerically:
     ```java
     List<Long> sorted = zoneIds.stream().distinct().sorted().toList();
     return eventZoneRepository.findAllByIdForUpdate(sorted);
     ```
   - Because all transactions acquire locks in strict ascending ID order, circular wait dependency ($T_1 \to T_2 \land T_2 \to T_1$) is mathematically impossible.
4. **Hardware-Grade Partial Unique Indexes:**
   - `uq_hold_one_active_per_user_event`: `ON hold(event_id, user_id) WHERE status = 'ACTIVE'`. Prevents malicious bots from locking up an entire venue by placing hundreds of parallel holds.
   - `uq_booking_item_seat`: `ON booking_item(event_seat_id) WHERE event_seat_id IS NOT NULL`. Structurally prevents the same seat from being booked twice at the database engine level.
5. **Hold Sweeper Daemon (`HoldExpiryJob`):**
   - Runs every 30 seconds (`app.hold.sweeper-interval-ms`).
   - Executes a partial index query: `WHERE status = 'ACTIVE' AND expires_at < NOW()`.
   - Releases held seats back to `AVAILABLE` and decrements `held_qty` on zones.

---

### 3.3 The Booking State Machine & Lifecycle
All booking status updates are governed by `BookingStateMachine`:

```
                       ┌──────────────────┐
                       │ PENDING_PAYMENT  │◄────────────┐
                       └────────┬─────────┘             │
                                │ (initiate payment)    │
                                ▼                       │
                     ┌──────────────────────┐           │
                     │ AWAITING_CONFIRMATION│           │
                     └──────┬──────────┬────┘           │
                            │          │                │
              (txn success) │          │ (txn failed)   │ (retry payment)
                            ▼          ▼                │
                     ┌───────────┐   ┌────────────────┐ │
                     │ CONFIRMED │   │ PAYMENT_FAILED ├─┘
                     └───────────┘   └───────┬────────┘
                      (Terminal:             │
                     Mints Tickets)          │ (expiry window / user cancel)
                                             ▼
                                   ┌───────────────────┐
                                   │ EXPIRED/CANCELLED │
                                   └───────────────────┘
                                    (Releases Inventory)
```

- **No Rollback on Expired Checkout:**  
  In `BookingService.convertHold()`, the method uses:
  ```java
  @Transactional(noRollbackFor = HoldExpiredException.class)
  ```
  If the customer took too long on the checkout screen, the hold's seats and zone capacity are released in the database immediately before throwing `HoldExpiredException` (HTTP 410), preventing inventory from becoming stranded until a sweeper runs.
- **Audit Logging:** Every transition atomically creates a `booking_status_history` record.

---

### 3.4 Cambodian Payment Systems (Bakong KHQR & ABA PayWay)

#### Bakong KHQR Subsystem
- **EMVCo Compliance:** Generates dynamic KHQR payloads conforming to the National Bank of Cambodia standard.
- **Dual Currency:** Supports both **USD** and **KHR** (`PaymentCurrency` enum records ISO 4217 numeric codes: 840 for USD, 116 for KHR).
- **Deep Linking:** Generates dynamic `bakong://...` links for 1-tap payment in mobile banking apps.
- **Automated Reconciler (`PaymentPoller`):** Polling daemon sweeps open transactions every few seconds and confirms paid bookings without requiring manual user refreshes.
- **Simulation Mode:** Provides an internal simulation controller for testing and offline presentation.

#### ABA PayWay Subsystem
- **Signed Checkout:** Checkout forms signed with **HMAC-SHA512** over merchant parameters.
- **Webhook Callbacks:** Asynchronous push notifications verified against the merchant secret.
- **Stale Close Sweeper:** Closes abandoned PayWay checkout sessions after expiry.

#### Financial Rigor
- **Frozen Exchange Rate (`fx_rate_khr_per_usd`):** The exchange rate is frozen at booking time. Even if national bank rates fluctuate, the customer's KHR bill is immutably locked.
- **Exact Commission Math:** Platform fees are calculated in **Basis Points** (`fee_bps`, where $1000 = 10.00\%$) rather than floating-point numbers (`double`/`float`), eliminating IEEE 754 binary floating-point rounding discrepancies.
- **Payment Single-Success Invariant:** Partial unique index `uq_payment_txn_one_success_per_booking WHERE status = 'SUCCESS'` guarantees that duplicate webhooks cannot create multiple successful payments.

---

### 3.5 Cryptographic Ticketing & Gate Turnstile Scanner

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            TICKET QR STRUCTURE                               │
│                                                                              │
│    EBT1   .        42        .   ARaBt9WwSFCg1I2WcHYqLA   .   pfBnW1S8Y6h... │
│    ────            ──            ──────────────────────       ────────────── │
│   Version       Ticket ID             122-bit Random              128-bit    │
│   Prefix       (Serial No)             Token (UUID)             HMAC-SHA256  │
└──────────────────────────────────────────────────────────────────────────────┘
```

1. **Unpredictable Random Token (Database Authority):** 122 bits of random entropy (`UUIDv4`). Knowing ticket 41 reveals zero information about ticket 42.
2. **HMAC-SHA256 Signature (Gate Filter):** Computed over `EBT1.<ticketId>.<base64UrlToken>` using `TICKET_SIGNING_SECRET`.
3. **Truncated 16-Byte Signature:** 128-bit truncated HMAC keeps the string under 60 characters. This produces a low-version QR code with larger modules, making it readable by low-cost phone cameras in poor lighting or through cracked screens.
4. **Constant-Time Verification:** Uses `MessageDigest.isEqual()` in `TicketTokenCodec` to prevent timing attacks.
5. **Turnstile Concurrency Lock:** Turnstiles execute `SELECT ... FOR UPDATE` on the ticket row before checking `checked_in_at`. If two turnstiles scan copies of the same ticket simultaneously, one succeeds and the second is immediately rejected as `ALREADY_CHECKED_IN`.
6. **Audit Trail (`ScanLog`):** Every scan attempt (successful, duplicate, or tampered) is logged with timestamp, operator user ID, gate name, and status.
7. **Production Startup Guard (`TicketSecretGuard`):** Under any non-dev Spring profile, the API refuses to start if `TICKET_SIGNING_SECRET` remains on the default placeholder string.

---

### 3.6 Security, Identity & Defenses

1. **Deny-by-Default Security:** `SecurityConfig.java` requires authentication for every endpoint not explicitly declared public.
2. **Access & Refresh Tokens:** 15-minute stateless JWT access tokens; 14-day opaque refresh tokens stored in `refresh_token` as **SHA-256 hashes**.
3. **Login Rate Limiting (`LoginRateLimiter`):** Evaluates rate limits in memory **before** executing BCrypt password checks, preventing CPU exhaustion DoS attacks.
4. **Row-Level Ownership Resolvers (`OrganizerResolver`):** Guarantees that organizers can only inspect and mutate venues, events, and payouts belonging to their own organization.
5. **Google OAuth2 & Phone Gate (`PhoneGate.jsx`):** Customers signing in with Google are gated before checkout until a valid Cambodian phone number (`+855` / `0xx`) is linked.

---

### 3.7 Telegram Bot Integration & Webhooks

1. **Deep Link Onboarding:** Organizers click **Connect Telegram** in their dashboard, generating a 10-minute token and opening `https://t.me/cambobook_bot?start=<token>`.
2. **Webhook Verification:** Telegram's servers POST updates to `/api/v1/telegram/webhook`, validated via `X-Telegram-Bot-Api-Secret-Token`.
3. **Automated Push Notifications:** Instant Telegram alerts when an event is approved by an admin or when a new ticket is sold.
4. **Conversational `/stats` Command:** Organizers can text `/stats` to receive an instant real-time sales and revenue breakdown.

---

## 4. Database Engineering: 34 Flyway Migrations & Kernel Invariants

Flyway owns the database schema as the single source of truth (`ddl-auto: validate`).

### Complete Migration Catalog (V1 to V34)

| Migration | File | Core Engineering Function |
|---|---|---|
| **V1** | `V1__schema.sql` | Core schema: identity, venue, event, hot seat inventory, holds, bookings, payments, tickets, triggers |
| **V2** | `V2__venue.sql` | Added `is_disabled` to `venue` and `active` boolean flag to `event_zone` |
| **V3** | `V3__booking_item_release.sql` | Added inventory release triggers and check constraints on booking items |
| **V4** | `V4__payment_polling.sql` | Added optimized indexes for the payment polling reconciler |
| **V5** | `V5__fix_locale_case.sql` | Normalized locale casing in reference tables |
| **V6** | `V6__seed_demo_users.sql` | Initial demo accounts (dev seed) |
| **V7** | `V7__add_event_cover_and_category.sql` | Added event category and cover photo metadata |
| **V8** | `V8__aba_payway_payments.sql` | Schema support for ABA PayWay transactions |
| **V9** | `V9__google_login.sql` | Support for Google OAuth sub IDs and social auth providers |
| **V10** | `V10__payway_booking_link.sql` | Added PayWay checkout link references to booking entity |
| **V11** | `V11__payway_checkout_form.sql` | JSONB column to persist ABA PayWay signed checkout forms |
| **V12** | `V12__event_banner_image.sql` | Cloudinary banner image support for wide event headers |
| **V13** | `V13__seed_demo_users_bcrypt.sql` | BCrypt password upgrade for demo users |
| **V14** | `V14__event_review_lifecycle.sql` | Event review queue, moderation states, transitions, review notes |
| **V15** | `V15__organizer_profile_names.sql` | Added bilingual English and Khmer organizer profile names |
| **V16** | `V16__scan_log.sql` | Dedicated turnstile check-in audit table for gate scanning |
| **V17** | `V17__all_cambodian_provinces.sql` | Seeded all 25 Cambodian provinces/municipalities in English & Khmer |
| **V18** | `V18__event_image_urls.sql` | Cloudinary URL columns for event posters |
| **V19** | `V19__reset_demo_passwords_bcrypt.sql` | Finalized BCrypt demo passwords |
| **V20** | `V20__organizer_application.sql` | Self-service organizer applications and admin approval workflow |
| **V21** | `V21__shared_venues.sql` | Support for shared public arenas vs private organizer venues |
| **V22** | `V22__drop_app_user_locale.sql` | Decoupled user locale to client preference |
| **V23** | `V23__notification.sql` | In-app notification system across all user roles |
| **V24** | `V24__link_google_to_existing_account.sql` | Account linking between Google logins and existing email profiles |
| **V25** | `V25__local_phone_format.sql` | Relaxed phone validation regex to support local `0xx` alongside `+855` |
| **V26** | `V26__normalise_app_user_phone_to_local.sql` | Database normalization function for Cambodian phone formats |
| **V27** | `V27__venues_are_private.sql` | Enforced strict venue isolation per organizer |
| **V28** | `V28__organizer_telegram_connect.sql` | Telegram deep link connect tokens and expiry timestamps |
| **V29** | `V29__organizer_payout.sql` | Payout request table, basis points commission math, ABA bank account details |
| **V30** | `V30__drop_booking_refund_states.sql` | Streamlined booking state machine by removing unused refund states |
| **V31** | `V31__fold_app_user_email_to_lower_case.sql` | Case-folding emails to lowercase to prevent account duplication |
| **V32** | `V32__app_user_telegram_username.sql` | Added Telegram username tracking to app users |
| **V33** | `V33__contact_message.sql` | Public support contact message queue and rate limit tracking |
| **V34** | `V34__clear_placeholder_venue_pins.sql` | Cleared mock venue coordinates for accurate Leaflet geolocation |

---

## 5. Error Handling Architecture (RFC 7807 Problem Details)

CamboBook implements the IETF **RFC 7807 Problem Details** standard via `GlobalExceptionHandler` and `ApiProblemFactory`. All error responses return structured, machine-readable JSON:

```json
{
  "type": "https://api.cambobook.com/errors/seat-unavailable",
  "title": "Seat Unavailable",
  "status": 409,
  "detail": "One or more seats were just taken by another customer. Please try again.",
  "errorCode": "SEAT_UNAVAILABLE",
  "retryable": false,
  "timestamp": "2026-09-22T12:45:00Z"
}
```

---

## 6. Frontend Engineering: React 19, Vite 8 & Axios Resilience

1. **Concurrent React 19 & Vite 8:** Sub-second hot module reloading, zero cumulative layout shift (CLS), and modular code-splitting.
2. **Axios Debounced Token Refresh (`client.js`):**  
   When a user loads a dashboard firing 6 parallel API calls with an expired access token, standard interceptors would fire 6 parallel `/auth/refresh` requests. Because refresh tokens are rotated (revoked on first use), requests 2–6 would present a revoked token, signing the user out.  
   **CamboBook Solution:** A singleton promise lock (`let refreshing = null`) ensures only the first 401 triggers `/auth/refresh`; the other 5 calls await the same promise and replay automatically.
3. **Turnstile Camera Scanner (`html5-qrcode`):** Browser-based QR code decoding directly from phone cameras with haptic feedback and instant visual indicators (Green = Admitted, Red = Rejected/Duplicate).

---

## 7. DevOps, Monitoring & Production Deployment

1. **Local Parity:** `docker-compose.yml` runs PostgreSQL 16 on port `55432` and pgAdmin on `55050`.
2. **Production Deployment (`deploy/`):** Containerized stack fronted by Caddy, providing automatic Let's Encrypt TLS certificates and proxying `/api/*` and static assets under a unified domain.
3. **Observability Stack:** Spring Boot Actuator with `/actuator/prometheus`, monitored by Prometheus and Grafana.

---

## 8. The Master Defense Q&A Playbook (Anticipating the Toughest Questions)

### Concurrency & Data Integrity

#### Q1: What happens if two customers click to buy the very last seat at the exact same millisecond?
> **Strong Answer:**  
> "Double-booking is prevented at two independent layers:
> 1. In the application layer, `createHold` checks `seat.getStatus() == SeatStatus.AVAILABLE`. `EventSeat` uses JPA `@Version` optimistic locking. If two transactions read the seat as available simultaneously, the first to commit increments the version number. The second transaction triggers an `ObjectOptimisticLockingFailureException`, which our service catches and translates into a friendly `409 Conflict: Seat is unavailable`.
> 2. Even if an application bug bypassed this, the database holds a partial unique index: `uq_booking_item_seat ON booking_item(event_seat_id) WHERE event_seat_id IS NOT NULL`. The database engine itself will refuse to insert the second row, maintaining absolute relational integrity."

#### Q2: Why did you use pessimistic locking for general admission zones but optimistic locking for assigned seats?
> **Strong Answer:**  
> "This is a deliberate architectural trade-off based on resource contention:
> - Seats are high in quantity and low in contention—two users rarely pick row G, seat 14 at the exact same instant. Optimistic locking has zero lock-overhead and avoids database blocking.
> - Zones (general admission) represent a shared counter. In a flash sale, hundreds of users compete for the last few tickets. If we used optimistic locking here, 90% of requests would abort due to version collision churn. By using pessimistic row-level locking (`SELECT ... FOR UPDATE`), transactions line up cleanly in a queue. We also sort the zone IDs before locking to guarantee deadlock freedom."

#### Q3: Why use Flyway instead of letting Hibernate auto-generate the tables with `ddl-auto=update`?
> **Strong Answer:**  
> "In an enterprise environment, `ddl-auto=update` is dangerous. It can silently drop columns, cannot handle complex partial indexes or custom triggers, and provides no historical audit trail.
> Flyway enforces a **Schema-First** methodology: every database change is a version-controlled SQL script reviewed in git. Hibernate is strictly configured with `ddl-auto=validate`, meaning the application will refuse to start if entity annotations do not match the database reality."

---

### Payments & Financial Integrity

#### Q4: What happens if a network glitch causes Bakong or ABA PayWay to send the payment confirmation webhook twice?
> **Strong Answer:**  
> "We enforce idempotency at both the ingestion and transaction level:
> 1. In `payment_webhook_event`, we enforce a unique constraint on `(provider, provider_event_id)`. A duplicated webhook payload is rejected immediately.
> 2. On the `payment_transaction` table, we have a partial unique index: `uq_payment_txn_one_success_per_booking ON payment_transaction(booking_id) WHERE status = 'SUCCESS'`. Even if two distinct webhook calls slip through application checks simultaneously, the database refuses to record more than one successful payment for any booking."

#### Q5: Cambodia uses both USD and KHR. How do you prevent rounding discrepancies or exchange rate loss?
> **Strong Answer:**  
> "First, we freeze the foreign exchange rate (`fx_rate_khr_per_usd`) at the instant the booking is created. Even if the national bank rate fluctuates an hour later, the customer's KHR bill is immutably locked.
> Second, all monetary calculations are handled in minor units (integer cents for USD, integer Riel for KHR), and platform fees are computed using basis points (`fee_bps`, $1000 = 10\%$) rather than floating-point math, preventing IEEE 754 precision loss."

---

### Security & Architecture

#### Q6: Can an attacker forge a ticket QR code or clone someone's ticket by screenshotting it?
> **Strong Answer:**  
> "No:
> 1. An attacker cannot forge a QR code because our QR codes carry an HMAC-SHA256 signature generated with a 256-bit private server secret. Any modified ticket ID or payload is rejected in constant time at the gate without touching the database.
> 2. If a user shares or screenshots a legitimate QR, only the first person to reach the gate is admitted. During check-in, our service executes a pessimistic row lock (`SELECT FOR UPDATE`) on the ticket. The turnstile updates `checked_in_at` atomically. When the second copy is scanned seconds later, the scanner flags it as `ALREADY_CHECKED_IN` and logs the violation in `ScanLog`."

#### Q7: Why use stateless JWT with refresh token rotation instead of traditional server-side sessions?
> **Strong Answer:**  
> "Our architecture separates the React SPA from the Spring Boot API, prepared for horizontal scaling behind a load balancer without sticky sessions.
> Access tokens are short-lived (15 minutes). To prevent token theft vulnerabilities, refresh tokens are opaque, rotated on every usage, and stored in the database **as SHA-256 hashes**. If our database were ever compromised, an attacker could not extract valid refresh tokens to impersonate users."

---

## 9. Step-by-Step Live Defense Demo Script (5–7 Minutes)

| Time | Action | Speaking Points |
|---|---|---|
| **0:00 - 1:00** | Open Landing Page (`/`) | "Good morning, respected committee. Today we present CamboBook, a production-grade event ticketing platform tailored for Cambodia. It solves the real-world problems of ticket scalping, overselling, and lack of digital payment support." |
| **1:00 - 2:15** | Select Seated Event $\to$ Seat Map | "Watch our interactive seat map. Selecting seats triggers a 10-minute hold timer. Under the hood, JPA optimistic locking and partial database indexes protect these seats from double-booking. If another user attempts to select these seats right now, the system prevents a double hold." |
| **2:15 - 3:15** | Checkout $\to$ Payment Modal | "Here is the dynamic Bakong KHQR. Notice the frozen KHR exchange rate. We trigger simulation payment: the background reconciler verifies settlement, our Booking State Machine transitions to CONFIRMED, and cryptographic tickets are issued." |
| **3:15 - 4:15** | Open Gate Check-In (`/organizer/check-in`) | "This is our turnstile scanner using the device camera. We scan the ticket: it validates green. If we scan the exact same QR code a second time, the system flags it red as 'Already Admitted' backed by a database row-level lock and audit log." |
| **4:15 - 5:15** | Organizer & Admin Dashboards | "Organizers can design venue layouts with our SVG editor, link their Telegram account to receive real-time sales alerts and `/stats`, and request commission payouts. Admins manage the platform through a strict event moderation queue." |
| **5:15 - 6:00** | Conclusion & Architecture Slide | "CamboBook combines enterprise Spring Boot 4, React 19, 34 Flyway database migrations, and cryptographic ticketing to deliver a robust solution tailored for Cambodia's digital economy. Thank you, and we welcome your questions." |

---
*Verified against codebase schema `V1`–`V34` and backend test suite.*
