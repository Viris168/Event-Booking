import { buildSeed, PROVINCES } from '../src/mock/seed.js';
import fs from 'fs';

const db = buildSeed();

function escape(str) {
  if (str === null || str === undefined) return 'NULL';
  if (typeof str === 'boolean') return str ? 'true' : 'false';
  if (typeof str === 'number') return str;
  return `'${String(str).replace(/'/g, "''")}'`;
}

function formatSql(table, cols, rows) {
  if (!rows || rows.length === 0) return '';
  const lines = rows.map(row => {
    const vals = cols.map(c => escape(row[c]));
    return `  (${vals.join(', ')})`;
  });
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES\n${lines.join(',\n')};\n`;
}

let sql = `
-- ============================================================
-- AUTO-GENERATED SQL SEED FROM MOCK DATA
-- Run this to populate the database with the mock data
-- ============================================================

BEGIN;

-- 1. Provinces
`;

sql += formatSql('province_ref', ['code', 'name_en', 'name_km'], PROVINCES);

sql += '\n-- 2. Users\n';
sql += formatSql('app_user', ['id', 'phone_e164', 'email', 'password_hash', 'display_name', 'locale', 'role', 'is_disabled', 'created_at'], 
  db.users.map(u => ({
    ...u,
    password_hash: 'dev-seed-not-a-real-hash',
    created_at: u.created_at
  }))
);
// Adjust sequence
sql += `SELECT setval('app_user_id_seq', (SELECT MAX(id) FROM app_user));\n`;

sql += '\n-- 3. Organizer Profiles\n';
sql += formatSql('organizer_profile', ['id', 'user_id', 'org_name_en', 'org_name_km', 'telegram_chat_id', 'created_at'], db.organizerProfiles);
sql += `SELECT setval('organizer_profile_id_seq', (SELECT MAX(id) FROM organizer_profile));\n`;

sql += '\n-- 4. Venues\n';
sql += formatSql('venue', ['id', 'organizer_id', 'name_en', 'name_km', 'province_code', 'khan_district', 'sangkat_commune', 'street_address', 'lat', 'lng', 'created_at'], db.venues);
sql += `SELECT setval('venue_id_seq', (SELECT MAX(id) FROM venue));\n`;

sql += '\n-- 5. Venue Seats\n';
sql += formatSql('venue_seat', ['id', 'venue_id', 'section_label', 'row_label', 'seat_number', 'pos_x', 'pos_y'], db.venueSeats);
sql += `SELECT setval('venue_seat_id_seq', (SELECT MAX(id) FROM venue_seat));\n`;

sql += '\n-- 6. Events\n';
sql += formatSql('event', ['id', 'organizer_id', 'venue_id', 'inventory_mode', 'slug', 'title_en', 'title_km', 'description_en', 'description_km', 'status', 'starts_at', 'doors_open_at', 'sales_open_at', 'sales_close_at', 'created_at'], db.events);
sql += `SELECT setval('event_id_seq', (SELECT MAX(id) FROM event));\n`;

sql += '\n-- 7. Seat Classes\n';
sql += formatSql('seat_class', ['id', 'event_id', 'name_en', 'name_km', 'price_usd_cents'], db.seatClasses);
sql += `SELECT setval('seat_class_id_seq', (SELECT MAX(id) FROM seat_class));\n`;

sql += '\n-- 8. Event Zones\n';
sql += formatSql('event_zone', ['id', 'event_id', 'name_en', 'name_km', 'price_usd_cents', 'capacity', 'held_qty', 'sold_qty', 'version'], db.eventZones);
sql += `SELECT setval('event_zone_id_seq', (SELECT MAX(id) FROM event_zone));\n`;

sql += '\n-- 9. Event Seats\n';
sql += formatSql('event_seat', ['id', 'event_id', 'venue_seat_id', 'seat_class_id', 'status', 'version'], db.eventSeats.map(s => ({...s, hold_id: null, hold_expires_at: null})));
sql += `SELECT setval('event_seat_id_seq', (SELECT MAX(id) FROM event_seat));\n`;

sql += '\n-- 10. Holds\n';
sql += formatSql('hold', ['id', 'event_id', 'user_id', 'status', 'expires_at', 'created_at', 'extended'], db.holds);
sql += `SELECT setval('hold_id_seq', (SELECT MAX(id) FROM hold));\n`;

sql += '\n-- 11. Hold Zone Lines (Rebuild from DB if needed, but we have them in memory via bookings usually)\n';
// Note: mock/seed.js doesn't explicitly store hold_zone_line in db object except dynamically. 
// For this script, we can extract it from bookingItems that are attached to ACTIVE holds.
const holdZoneLines = [];
let nextHoldZoneLineId = 1;
db.holds.filter(h => h.status === 'ACTIVE').forEach(hold => {
  const booking = db.bookings.find(b => b.hold_id === hold.id);
  if (booking) {
    db.bookingItems.filter(i => i.booking_id === booking.id && i.event_zone_id).forEach(i => {
      holdZoneLines.push({ id: nextHoldZoneLineId++, hold_id: hold.id, event_zone_id: i.event_zone_id, qty: i.qty });
    });
  }
});
sql += formatSql('hold_zone_line', ['id', 'hold_id', 'event_zone_id', 'qty'], holdZoneLines);
sql += `SELECT setval('hold_zone_line_id_seq', (SELECT MAX(id) FROM hold_zone_line));\n`;

// Update event_seat with hold_id now that holds exist
sql += '\n-- Update Event Seats with holds\n';
db.eventSeats.filter(s => s.hold_id && s.hold_id !== -1).forEach(s => {
  sql += `UPDATE event_seat SET hold_id = ${s.hold_id}, hold_expires_at = ${escape(s.hold_expires_at)} WHERE id = ${s.id};\n`;
});

sql += '\n-- 12. Bookings\n';
sql += formatSql('booking', ['id', 'booking_ref', 'event_id', 'user_id', 'hold_id', 'state', 'buyer_name', 'buyer_phone_e164', 'buyer_email', 'subtotal_usd_cents', 'total_usd_cents', 'fx_rate_khr_per_usd', 'total_khr', 'created_at', 'state_changed_at'], db.bookings);
sql += `SELECT setval('booking_id_seq', (SELECT MAX(id) FROM booking));\n`;

sql += '\n-- 13. Booking Items\n';
sql += formatSql('booking_item', ['id', 'booking_id', 'event_seat_id', 'event_zone_id', 'qty', 'unit_price_usd_cents'], db.bookingItems);
sql += `SELECT setval('booking_item_id_seq', (SELECT MAX(id) FROM booking_item));\n`;

sql += '\n-- 14. Tickets\n';
sql += formatSql('ticket', ['id', 'booking_item_id', 'unit_seq', 'qr_token', 'checked_in_at', 'checked_in_by', 'issued_at'], db.tickets);
sql += `SELECT setval('ticket_id_seq', (SELECT MAX(id) FROM ticket));\n`;

sql += '\n-- 15. Payments\n';
sql += formatSql('payment_transaction', ['id', 'booking_id', 'provider', 'provider_ref', 'idempotency_key', 'currency_charged', 'amount_usd_cents', 'amount_khr', 'status', 'expires_at', 'created_at', 'resolved_at'], db.payments);
sql += `SELECT setval('payment_transaction_id_seq', (SELECT MAX(id) FROM payment_transaction));\n`;

sql += '\n-- 16. Booking History\n';
sql += formatSql('booking_status_history', ['id', 'booking_id', 'from_state', 'to_state', 'changed_by_user_id', 'note', 'changed_at'], db.bookingHistory);
sql += `SELECT setval('booking_status_history_id_seq', (SELECT MAX(id) FROM booking_status_history));\n`;

sql += '\nCOMMIT;\n';

fs.writeFileSync('../api/data-seed.sql', sql);
console.log('Successfully generated SQL seed file: api/data-seed.sql');
