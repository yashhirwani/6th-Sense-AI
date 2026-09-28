/**
 * Splits a streamed answer into speakable sentences so TTS can start on the first sentence
 * (lower perceived latency) instead of waiting for the whole response.
 */
export class SentenceStreamer {
  private buf = '';

  push(delta: string): string[] {
    this.buf += delta;
    const out: string[] = [];
    // Sentence end: . ! ? or Devanagari danda, followed by whitespace. Avoid splitting "1.5" or "Dr.".
    const re = /([^.!?।]*?(?:[.!?।]+))(\s+)/g;
    let consumed = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.buf))) {
      const candidate = m[1];
      const lastWord = candidate.trim().split(/\s+/).pop() ?? '';
      if (/^(dr|mr|mrs|ms|st|no|approx|vs|e\.g|i\.e)\.$/i.test(lastWord)) continue;
      const sentence = this.buf.slice(consumed, m.index + candidate.length).trim();
      if (sentence.length >= 2) out.push(sentence);
      consumed = m.index + m[0].length;
    }
    this.buf = this.buf.slice(consumed);
    return out;
  }

  flush(): string | null {
    const rest = this.buf.trim();
    this.buf = '';
    return rest.length ? rest : null;
  }
}
