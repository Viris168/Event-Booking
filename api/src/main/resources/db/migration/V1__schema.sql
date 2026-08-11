-- ============================================================
-- FULL TICKETING PLATFORM SCHEMA (Cambodia-market example)
-- Combines identity/tenancy, venues, mixed seat+zone event
-- inventory, holds, bookings, payments, tickets and audit trail.
-- Order of sections follows dependency order for a clean run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Identity & tenancy
-- ------------------------------------------------------------

CREATE TABLE app_user (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    phone_e164      TEXT NOT NULL UNIQUE
                        CHECK (phone_e164 ~ '^\+855[0-9]{8,9}$'),
    email           TEXT UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    locale          TEXT NOT NULL DEFAULT 'km'
                        CHECK (locale IN ('km','en')),
    role            TEXT NOT NULL DEFAULT 'CUSTOMER'
                        CHECK (role IN ('CUSTOMER','ORGANIZER','PLATFORM_ADMIN')),
    is_disabled     BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organizer_profile (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             BIGINT NOT NULL UNIQUE REFERENCES app_user(id),
    org_name_en         TEXT NOT NULL,
    org_name_km         TEXT NOT NULL,
    telegram_chat_id    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [FIX 2] Opaque, rotating, DB-backed refresh tokens.
-- The access token is a stateless 15-minute JWT (nothing stored here).
-- Only the refresh token is persisted, and only as a SHA-256 hash so a
-- database leak cannot be replayed. Rotation = mark the old row revoked
-- and insert a new one; revocation is therefore instant.
CREATE TABLE refresh_token (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,       -- SHA-256 of the opaque token
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,                -- NULL = still valid
    user_agent      TEXT,                       -- for "active sessions" UI later
    CHECK (expires_at > issued_at)
);

-- Lookup path for POST /auth/refresh: find this user's live tokens.
CREATE INDEX idx_refresh_token_user_active
    ON refresh_token (user_id)
    WHERE revoked_at IS NULL;

-- ------------------------------------------------------------
-- 2. Reference / lookup
-- ------------------------------------------------------------

CREATE TABLE province_ref (
    code        TEXT PRIMARY KEY,
    name_en     TEXT NOT NULL,
    name_km     TEXT NOT NULL
);

-- ------------------------------------------------------------
-- 3. Venue & physical seat map (event-independent)
-- ------------------------------------------------------------

CREATE TABLE venue (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organizer_id        BIGINT NOT NULL REFERENCES organizer_profile(id),
    name_en             TEXT NOT NULL,
    name_km             TEXT NOT NULL,
    province_code       TEXT NOT NULL REFERENCES province_ref(code),
    khan_district       TEXT NOT NULL,
    sangkat_commune     TEXT NOT NULL,
    street_address      TEXT NOT NULL,
    lat                 NUMERIC(9,6),
    lng                 NUMERIC(9,6),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE venue_seat (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venue_id        BIGINT NOT NULL REFERENCES venue(id),
    section_label   TEXT NOT NULL,      -- e.g. 'Zone A'
    row_label       TEXT NOT NULL,
    seat_number     TEXT NOT NULL,
    pos_x           NUMERIC(7,2) NOT NULL,
    pos_y           NUMERIC(7,2) NOT NULL,
    UNIQUE (venue_id, section_label, row_label, seat_number)
);

-- ------------------------------------------------------------
-- 4. Event
--    inventory_mode is a DESCRIPTOR, not a hard wall. A 'MIXED'
--    event may carry BOTH seat_class/event_seat rows (assigned
--    seating, e.g. Zone A / Zone B) AND event_zone rows
--    (no-seat GA capacity, e.g. GA Floor) at the same time.
--    Guard triggers below (section 6) keep this honest.
-- ------------------------------------------------------------

CREATE TABLE event (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organizer_id        BIGINT NOT NULL REFERENCES organizer_profile(id),
    venue_id            BIGINT NOT NULL REFERENCES venue(id),
    inventory_mode      TEXT NOT NULL
                            CHECK (inventory_mode IN ('SEATED','ZONED','MIXED')),
    slug                TEXT NOT NULL UNIQUE,
    title_en            TEXT NOT NULL,
    title_km            TEXT NOT NULL,
    description_en      TEXT NOT NULL DEFAULT '',
    description_km      TEXT NOT NULL DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN ('DRAFT','PUBLISHED','TAKEN_DOWN')),
    starts_at           TIMESTAMPTZ NOT NULL,
    doors_open_at       TIMESTAMPTZ NOT NULL,
    sales_open_at       TIMESTAMPTZ NOT NULL,
    sales_close_at      TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (sales_close_at <= starts_at)
);

-- ------------------------------------------------------------
-- 5. Pricing tiers: seated (Zone A/B) and zoned (GA floor)
-- ------------------------------------------------------------

CREATE TABLE seat_class (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id            BIGINT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    name_en             TEXT NOT NULL,      -- 'Zone A', 'Zone B'
    name_km             TEXT NOT NULL,
    price_usd_cents     INTEGER NOT NULL CHECK (price_usd_cents > 0),
    UNIQUE (event_id, name_en)
);

CREATE TABLE event_zone (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id            BIGINT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    name_en             TEXT NOT NULL,      -- 'GA Floor'
    name_km             TEXT NOT NULL,
    price_usd_cents     INTEGER NOT NULL CHECK (price_usd_cents > 0),
    capacity            INTEGER NOT NULL CHECK (capacity > 0),
    held_qty            INTEGER NOT NULL DEFAULT 0 CHECK (held_qty >= 0),
    sold_qty            INTEGER NOT NULL DEFAULT 0 CHECK (sold_qty >= 0),
    version             BIGINT NOT NULL DEFAULT 0,   -- optimistic locking
    UNIQUE (event_id, name_en),
    CHECK (held_qty + sold_qty <= capacity)
);

-- ------------------------------------------------------------
-- 6. Per-event seat inventory (hot table) + mode guard triggers
-- ------------------------------------------------------------

CREATE TABLE event_seat (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id            BIGINT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    venue_seat_id       BIGINT NOT NULL REFERENCES venue_seat(id),
    seat_class_id       BIGINT NOT NULL REFERENCES seat_class(id),
    status              TEXT NOT NULL DEFAULT 'AVAILABLE'
                            CHECK (status IN ('AVAILABLE','HELD','SOLD','BLOCKED')),
    hold_id             BIGINT,           -- FK attached in section 7
    hold_expires_at     TIMESTAMPTZ,
    version             BIGINT NOT NULL DEFAULT 0,   -- optimistic locking
    UNIQUE (event_id, venue_seat_id)
);

-- Cross-table guards: a CHECK constraint can't reference another
-- table, so mode consistency is enforced with triggers instead.
CREATE OR REPLACE FUNCTION fn_guard_seat_inventory() RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT inventory_mode FROM event WHERE id = NEW.event_id) NOT IN ('SEATED','MIXED') THEN
        RAISE EXCEPTION 'event % does not allow seated inventory', NEW.event_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_seat_class
    BEFORE INSERT ON seat_class
    FOR EACH ROW EXECUTE FUNCTION fn_guard_seat_inventory();

CREATE OR REPLACE FUNCTION fn_guard_zone_inventory() RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT inventory_mode FROM event WHERE id = NEW.event_id) NOT IN ('ZONED','MIXED') THEN
        RAISE EXCEPTION 'event % does not allow zoned inventory', NEW.event_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_event_zone
    BEFORE INSERT ON event_zone
    FOR EACH ROW EXECUTE FUNCTION fn_guard_zone_inventory();

-- [FIX 4] The two guards above only fire on INSERT, which leaves a hole:
-- create a SEATED event, add seat_class rows, then UPDATE the event to
-- 'ZONED' and you now have seated inventory hanging off a zoned event.
-- This trigger closes it from the other direction: an inventory_mode
-- change is rejected if inventory of the newly-disallowed kind exists.
CREATE OR REPLACE FUNCTION fn_guard_mode_change() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.inventory_mode = OLD.inventory_mode THEN
        RETURN NEW;
    END IF;

    IF NEW.inventory_mode NOT IN ('SEATED','MIXED')
       AND EXISTS (SELECT 1 FROM seat_class WHERE event_id = NEW.id) THEN
        RAISE EXCEPTION 'cannot change event % to %: seated inventory exists',
                        NEW.id, NEW.inventory_mode;
    END IF;

    IF NEW.inventory_mode NOT IN ('ZONED','MIXED')
       AND EXISTS (SELECT 1 FROM event_zone WHERE event_id = NEW.id) THEN
        RAISE EXCEPTION 'cannot change event % to %: zoned inventory exists',
                        NEW.id, NEW.inventory_mode;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_mode_change
    BEFORE UPDATE OF inventory_mode ON event
    FOR EACH ROW EXECUTE FUNCTION fn_guard_mode_change();

-- ------------------------------------------------------------
-- 7. Holds
--    One hold can cover a MIX in a single cart: specific
--    event_seat rows (via event_seat.hold_id) plus zone
--    quantities (via hold_zone_line).
-- ------------------------------------------------------------

CREATE TABLE hold (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id        BIGINT NOT NULL REFERENCES event(id),
    user_id         BIGINT NOT NULL REFERENCES app_user(id),
    status          TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE','CONSUMED','EXPIRED','RELEASED')),
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    extended        BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE event_seat
    ADD CONSTRAINT fk_event_seat_hold
    FOREIGN KEY (hold_id) REFERENCES hold(id) ON DELETE SET NULL;

-- [FIX 3] One active hold per user per event. Without this, a scripted
-- client can POST /holds in a loop and reserve the entire venue with a
-- single account. The app should catch the resulting unique violation and
-- return 409 HOLD_ALREADY_ACTIVE (offering to resume the existing hold),
-- not surface a raw SQL error.
CREATE UNIQUE INDEX uq_hold_one_active_per_user_event
    ON hold (event_id, user_id)
    WHERE status = 'ACTIVE';

CREATE TABLE hold_zone_line (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hold_id             BIGINT NOT NULL REFERENCES hold(id) ON DELETE CASCADE,
    event_zone_id       BIGINT NOT NULL REFERENCES event_zone(id),
    qty                 INTEGER NOT NULL CHECK (qty > 0),
    UNIQUE (hold_id, event_zone_id)
);

-- ------------------------------------------------------------
-- 8. Booking & line items
--    booking_item.CHECK forces every row to be EITHER a single
--    seat (qty=1) OR a zone quantity (qty>0) - never both,
--    never neither - so seat and zone lines can coexist freely
--    on one booking.
-- ------------------------------------------------------------

CREATE TABLE booking (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_ref             TEXT NOT NULL UNIQUE,
    event_id                BIGINT NOT NULL REFERENCES event(id),
    user_id                 BIGINT NOT NULL REFERENCES app_user(id),
    hold_id                 BIGINT NOT NULL UNIQUE REFERENCES hold(id),
    state                   TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
                                CHECK (state IN (
                                    'PENDING_PAYMENT','AWAITING_CONFIRMATION','PAYMENT_FAILED',
                                    'CONFIRMED','REFUND_REQUESTED','REFUNDED','EXPIRED','CANCELLED'
                                )),
    buyer_name              TEXT NOT NULL,
    buyer_phone_e164        TEXT NOT NULL
                                CHECK (buyer_phone_e164 ~ '^\+855[0-9]{8,9}$'),
    buyer_email              TEXT,
    subtotal_usd_cents      BIGINT NOT NULL CHECK (subtotal_usd_cents > 0),
    total_usd_cents          BIGINT NOT NULL CHECK (total_usd_cents > 0),
    fx_rate_khr_per_usd      NUMERIC(12,4) NOT NULL,
    total_khr                BIGINT NOT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    state_changed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE booking_item (
    id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id                  BIGINT NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
    event_seat_id                BIGINT REFERENCES event_seat(id),
    event_zone_id                BIGINT REFERENCES event_zone(id),
    qty                          INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
    unit_price_usd_cents         INTEGER NOT NULL,
    CHECK (
        (event_seat_id IS NOT NULL AND event_zone_id IS NULL AND qty = 1)
        OR
        (event_seat_id IS NULL AND event_zone_id IS NOT NULL AND qty > 0)
    )
);

-- Structural double-booking guard, DB-enforced regardless of app logic.
CREATE UNIQUE INDEX uq_booking_item_seat
    ON booking_item (event_seat_id)
    WHERE event_seat_id IS NOT NULL;

-- ------------------------------------------------------------
-- 9. Payments
-- ------------------------------------------------------------

CREATE TABLE payment_transaction (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id          BIGINT NOT NULL REFERENCES booking(id),
    provider             TEXT NOT NULL
                            CHECK (provider IN ('BAKONG_KHQR','ABA_PAYWAY')),
    provider_ref          TEXT,
    idempotency_key        TEXT NOT NULL UNIQUE,
    currency_charged      TEXT NOT NULL
                            CHECK (currency_charged IN ('USD','KHR')),
    amount_usd_cents      BIGINT NOT NULL,
    amount_khr            BIGINT NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'CREATED'
                            CHECK (status IN ('CREATED','PENDING','SUCCESS','FAILED','CANCELLED','EXPIRED')),
    expires_at             TIMESTAMPTZ NOT NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at            TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_payment_txn_provider_ref
    ON payment_transaction (provider, provider_ref)
    WHERE provider_ref IS NOT NULL;

-- [FIX 1] At most ONE successful payment per booking, ever. A booking may
-- accumulate several attempt rows (retry after a failed PIN, switching from
-- KHQR to PayWay), but a second SUCCESS means the customer was charged
-- twice. This is the last line of defence behind webhook idempotency:
-- even if a duplicate callback slips past every application check, the
-- database refuses the second success row.
CREATE UNIQUE INDEX uq_payment_txn_one_success_per_booking
    ON payment_transaction (booking_id)
    WHERE status = 'SUCCESS';

CREATE TABLE payment_webhook_event (
    id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider                     TEXT NOT NULL
                                    CHECK (provider IN ('BAKONG_KHQR','ABA_PAYWAY')),
    provider_event_id            TEXT NOT NULL,
    payment_transaction_id       BIGINT REFERENCES payment_transaction(id),
    payload                      JSONB NOT NULL,
    received_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at                 TIMESTAMPTZ,
    UNIQUE (provider, provider_event_id)
);

-- ------------------------------------------------------------
-- 10. Tickets & audit
--     One ticket per ADMISSION UNIT, not per booking_item.
--     A seat line (qty always 1) gets exactly one ticket.
--     A zone line with qty=3 gets THREE independently
--     scannable tickets (unit_seq 1..3).
-- ------------------------------------------------------------

CREATE TABLE ticket (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_item_id     BIGINT NOT NULL REFERENCES booking_item(id),
    unit_seq             INTEGER NOT NULL DEFAULT 1 CHECK (unit_seq > 0),
    qr_token             UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    checked_in_at         TIMESTAMPTZ,
    checked_in_by         BIGINT REFERENCES app_user(id),
    issued_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (booking_item_id, unit_seq)
);

CREATE TABLE booking_status_history (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id              BIGINT NOT NULL REFERENCES booking(id),
    from_state                TEXT,
    to_state                  TEXT NOT NULL,
    changed_by_user_id        BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
    note                      TEXT,
    changed_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 11. Helpful indexes for hot query paths
-- ------------------------------------------------------------

CREATE INDEX idx_event_seat_event_status ON event_seat (event_id, status);
CREATE INDEX idx_event_zone_event ON event_zone (event_id);
CREATE INDEX idx_hold_expiry ON hold (status, expires_at) WHERE status = 'ACTIVE';
CREATE INDEX idx_booking_event_state ON booking (event_id, state);
CREATE INDEX idx_ticket_booking_item ON ticket (booking_item_id);

-- [FIX 5] Five hot paths that were previously sequential scans.

-- Releasing or expiring a hold does: WHERE hold_id = ?  on the largest,
-- hottest table in the schema. Partial, because the overwhelming majority
-- of event_seat rows have hold_id IS NULL at any moment - indexing those
-- would bloat the index for nothing. This is the most valuable of the five.
CREATE INDEX idx_event_seat_hold
    ON event_seat (hold_id)
    WHERE hold_id IS NOT NULL;

-- GET /me/bookings?state=...
CREATE INDEX idx_booking_user_state
    ON booking (user_id, state);

-- Loading a booking's payment attempts; also the reconciliation job's
-- join back from bookings stuck in AWAITING_CONFIRMATION.
CREATE INDEX idx_payment_txn_booking
    ON payment_transaction (booking_id, status);

-- Event publish expands venue_seat -> event_seat: WHERE venue_id = ?
-- Also drives the seat-map authoring/import screen.
CREATE INDEX idx_venue_seat_venue
    ON venue_seat (venue_id);

-- Rendering a booking's audit trail chronologically in admin tooling.
CREATE INDEX idx_booking_status_history_booking
    ON booking_status_history (booking_id, changed_at);

-- Zone line aggregation for GET /organizer/events/{id}/sales-summary.
CREATE INDEX idx_booking_item_zone
    ON booking_item (event_zone_id)
    WHERE event_zone_id IS NOT NULL;

