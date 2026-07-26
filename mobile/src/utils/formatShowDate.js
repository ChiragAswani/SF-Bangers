export function formatShowDate(show) {
  if (!show?.date) return show?.dayOfWeek || 'Date TBD';
  try {
    const d = new Date(`${show.date}T00:00:00`);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch (e) {
    return show.date;
  }
}
