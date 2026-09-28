/** Parse one Server-Sent Events block ("event: x\ndata: {...}") into its event name and data. */
export function parseSse(raw: string): { event: string; data: string } | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  return data.length ? { event, data: data.join('\n') } : null;
}
