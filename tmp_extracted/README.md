# Verification API — Spring Boot port

Same design and guarantees as before, translated to Spring idioms:

## Locking: `FOR UPDATE` → `@Lock(PESSIMISTIC_WRITE)`

`TicketRepository.findByIdForUpdate` / `findAllForOrderForUpdate` use Spring Data's
`@Lock(LockModeType.PESSIMISTIC_WRITE)`, which Hibernate translates to
`SELECT ... FOR UPDATE` against Postgres. The lock is held for the life of the
enclosing `@Transactional` method (`VerificationService.verifyIndividual` /
`confirmGroup`) and released on commit or rollback — functionally identical to
the manual `BEGIN/COMMIT` blocks in the Node version.

**Important:** `spring.jpa.open-in-view` is set to `false` in `application.yml`.
If you leave it on (Spring Boot's default), the persistence context — and the
row lock with it — can outlive the transaction and stay open into view
rendering, which defeats the point of locking around a gate-scan race.

## Authorization: two-stage, same as before

1. `SessionJwtFilter` — a servlet filter that authenticates the scanner's own
   login token and puts their `userId` in the `SecurityContext`. This is a
   global filter; it runs for every request but only proves *who*.
2. `EventStaffInterceptor` — a `HandlerInterceptor` scoped to
   `/api/events/{eventId}/verify/**` that checks `event_staff` for
   `(eventId, userId)`. This proves *may they scan for this event*, and is
   the only place that check happens. There's no admin role or flag anywhere
   in `SecurityConfig` that bypasses it — deliberately, so a future "add an
   admin role" change can't accidentally do it by touching the wrong file.

## Where the two versions differ mechanically

- Node's manual `client.query('BEGIN')` → Spring's `@Transactional` (managed
  by Spring's transaction manager, same isolation semantics).
- Node's Express middleware chain → a servlet `Filter` (auth) + MVC
  `HandlerInterceptor` (event scoping). The interceptor only applies to the
  `/verify/**` path pattern, not globally, since it needs a path variable.
- Entity field mutation inside `@Transactional` auto-flushes to the DB on
  commit (no explicit `UPDATE ... SET` or `.save()` call needed) — this is
  standard JPA dirty-checking, not something special to this design.

## Not yet built (same list as before, still open)

- Rate limiting on the verify endpoints.
- Structured audit log beyond the `scanned_by` column.
- Offline-scan queue/replay handling for gate devices without connectivity.
- Spring-side integration test hitting a real Postgres (e.g. via Testcontainers)
  to actually exercise the two-gate race condition — worth adding before this
  goes anywhere near production.
