/**
 * Reads a newline-delimited JSON stream (one event object per line) from a fetch Response
 * and calls `onEvent` for each parsed line as it arrives, so the UI can reflect real,
 * incremental progress instead of waiting for the whole response to land.
 */
export async function readNdjsonStream<T>(response: Response, onEvent: (event: T) => void): Promise<void> {
  const body = response.body;
  if (!body) return;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) onEvent(JSON.parse(line) as T);
      newlineIndex = buffer.indexOf("\n");
    }

    if (done) {
      const trailing = buffer.trim();
      if (trailing) onEvent(JSON.parse(trailing) as T);
      break;
    }
  }
}
