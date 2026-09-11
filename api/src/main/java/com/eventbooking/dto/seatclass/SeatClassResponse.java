package com.eventbooking.dto.seatclass;

public record SeatClassResponse(
        Long id,
        Long eventId,
        String nameEn,
        String nameKm,
        Integer priceUsdCents,
        /**
         * The venue section this tier prices, derived from the seats assigned to
         * it - a seat class has no section column, because the link runs through
         * event_seat to venue_seat.
         *
         * <p>Null when it cannot be answered: a tier with no seats assigned yet,
         * or one whose seats span more than one section. Both are legal, and
         * guessing at either would be worse than saying nothing - the organiser
         * form binds one tier per section and would silently attach a tier to a
         * section it does not price.
         */
        String sectionLabel,
        long seatCount,
        long soldCount,
        /* Seats someone else is part-way through buying. Counted separately from
           sold because a hold is temporary - it lapses back to available - and a
           capacity bar that folded the two together would tell a customer a tier
           was gone when it was only busy. */
        long heldCount
) {
}
