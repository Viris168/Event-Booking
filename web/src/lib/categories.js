/**
 * The categories an event can be filed under.
 *
 * Lifted out of EventFormPage once a second screen needed it. It is the kind of
 * list that looks safe to retype - six short strings - and is not: the value is
 * stored verbatim in event.category and matched verbatim by the browse filters,
 * so one screen offering "conference" while another offers "conferences" makes
 * events that no filter can find.
 */
export const CATEGORIES = ['music', 'festival', 'conference', 'culture', 'sport', 'comedy']
