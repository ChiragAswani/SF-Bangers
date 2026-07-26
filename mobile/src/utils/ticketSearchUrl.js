// A precise per-show ticket link needs a real ticketing API (on hold pending
// SeatGeek approval — see src/getTicketLinks.js on the backend). Until then,
// a Ticketmaster search for the artist's name is a deterministic, always-
// available link that needs no API call, no matching logic, and can't be wrong.
export function ticketSearchUrl(artistName) {
    return `https://www.ticketmaster.com/search?q=${encodeURIComponent(artistName)}`;
}
