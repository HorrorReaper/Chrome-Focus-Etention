export function updateClock() {
  const now = new Date();
  const currentTimeEl = document.getElementById("currentTime");
  if (currentTimeEl) currentTimeEl.textContent = now.toLocaleTimeString(
    "de-DE",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }
  );
  const currentDateEl = document.getElementById("currentDate");
  if (currentDateEl) currentDateEl.textContent = now.toLocaleDateString(
    "de-DE",
    {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );
  const headerClockEl = document.getElementById("headerClock");
  if (headerClockEl) headerClockEl.textContent = now.toLocaleTimeString(
    "de-DE",
    { hour: "2-digit", minute: "2-digit", hour12: false }
  );
}