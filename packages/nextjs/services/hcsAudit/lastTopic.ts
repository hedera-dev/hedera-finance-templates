// The topic the desk last showed, kept in this browser so the header's Regulator link opens on it. Browser storage,
// not the server: `/regulator` must keep working with this app's server stopped. Storage can be unavailable (a
// private window, blocked site data), and then the feed simply opens empty.
const KEY = "hcs-audit:last-topic";

export function rememberTopic(topicId: string) {
  try {
    localStorage.setItem(KEY, topicId);
  } catch {}
}

export function lastTopic(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
