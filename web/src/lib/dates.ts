// Dates are entered and displayed as MM/DD/YYYY; stored as ISO (YYYY-MM-DD).

export function mmddyyyyToISO(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return null;
  return iso;
}

export function isoToMmddyyyy(s: string | null | undefined): string {
  if (!s) return "";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(s);
  return `${m[2]}/${m[3]}/${m[1]}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A project is "started" once its expected start date is today or in the past. */
export function isProjectStarted(startDate: string | null | undefined): boolean {
  if (!startDate) return false;
  return String(startDate).slice(0, 10) <= todayISO();
}
