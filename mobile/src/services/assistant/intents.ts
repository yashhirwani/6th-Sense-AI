/**
 * Local intent parsing for voice commands. Deterministic and offline: fast commands (read, find,
 * repeat, help...) never need the network. Anything not matched becomes a free-form `ask` for the
 * vision-language model, grounded on the current camera frame.
 */
export type ScanKind = 'product' | 'currency' | 'medicine';

export type Intent =
  | { type: 'describe' }
  | { type: 'read'; follow?: 'summarize' | 'translate' }
  | { type: 'find'; target: string }
  | { type: 'where'; target: string }
  | { type: 'remember'; target: string }
  | { type: 'navigate'; target: string }
  | { type: 'emergency' }
  | { type: 'repeat' }
  | { type: 'stop' }
  | { type: 'people' }
  | { type: 'scan'; kind: ScanKind }
  | { type: 'setting'; change: 'slower' | 'faster' | 'mute' | 'unmute' }
  | { type: 'ask'; query: string };

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/[?.!,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const stripArticles = (s: string) => s.replace(/^(my|the|a|an|some|our)\s+/, '').trim();

export function parseIntent(utterance: string): Intent {
  const raw = utterance.trim();
  const t = clean(raw);
  if (!t) return { type: 'ask', query: raw };

  // Safety first.
  if (/\b(help me|emergency|call for help|sos|i fell|i have fallen|i('m| am) hurt)\b/.test(t) || /(मदद|बचाओ|इमरजेंसी)/.test(raw)) {
    return { type: 'emergency' };
  }
  if (/^(stop|quiet|be quiet|shut up|silence|cancel)$/.test(t) || /^(रुको|चुप)/.test(raw)) return { type: 'stop' };
  if (/\b(repeat|say (that|it) again|what did you say|again)\b/.test(t) && t.split(' ').length <= 5) return { type: 'repeat' };
  if (/\b(speak|talk) (slower|more slowly)|slow down\b/.test(t)) return { type: 'setting', change: 'slower' };
  if (/\b(speak|talk) faster|speed up\b/.test(t)) return { type: 'setting', change: 'faster' };
  if (/^(mute|mute voice|turn off voice)$/.test(t)) return { type: 'setting', change: 'mute' };
  if (/^(unmute|unmute voice|turn on voice)$/.test(t)) return { type: 'setting', change: 'unmute' };

  // Memory: "where did I keep/leave/put my wallet", "where is my wallet".
  let m = t.match(/where (did|have) i (keep|kept|leave|left|put|place|placed) (.+)/);
  if (m) return { type: 'where', target: stripArticles(m[3]) };
  m = t.match(/where (is|are) (my) (.+)/);
  if (m) return { type: 'where', target: stripArticles(m[3]) };
  m = t.match(/remember (that )?(where )?(i (put|kept|left) )?(my|the) (.+?)( is here| are here| here)?$/);
  if (m && /^remember/.test(t)) return { type: 'remember', target: stripArticles(m[6]) };
  m = raw.match(/(मेरा|मेरी|मेरे)\s+(.+?)\s+(कहाँ|कहां)/);
  if (m) return { type: 'where', target: m[2] };

  // Scans.
  if (/\b(money|currency|note|rupee|rupees|cash|how much is this note)\b/.test(t) || /(नोट|पैसे|रुपये)/.test(raw)) return { type: 'scan', kind: 'currency' };
  if (/\b(medicine|tablet|pill|capsule|syrup|dosage|prescription|expiry of this medicine)\b/.test(t) || /(दवा|दवाई)/.test(raw)) return { type: 'scan', kind: 'medicine' };
  if (/\b(product|barcode|ingredients|nutrition|allergen|allergens|calories|protein|sugar|price of this|brand)\b/.test(t)) return { type: 'scan', kind: 'product' };

  // Reading.
  if (/^(read|read this|read it|read aloud|read the (text|sign|page|board|label|notice|menu|bill))\b/.test(t) || /\bwhat does (it|this|the sign|this sign) say\b/.test(t) || /(पढ़ो|पढ़ें|पढ़िए)/.test(raw)) {
    return { type: 'read' };
  }
  if (/\b(summari[sz]e|summary of) (this|the)?\s*(page|document|text|letter)?/.test(t)) return { type: 'read', follow: 'summarize' };
  if (/\btranslate\b/.test(t)) return { type: 'read', follow: 'translate' };

  // Navigation.
  m = t.match(/^(take me|guide me|navigate|lead me|walk me|go) (to|towards) (.+)/);
  if (m) return { type: 'navigate', target: stripArticles(m[3]) };

  // Finding things in view.
  m = t.match(/^(find|look for|search for|locate|where is|where's|where are) (.+)/);
  if (m) return { type: 'find', target: stripArticles(m[2]) };

  // People / social.
  if (/\b(who is (here|there|in front|around)|anyone (waving|there)|is someone (waving|there|coming)|who('s| is) waving|people around)\b/.test(t)) {
    return { type: 'people' };
  }

  // Scene description.
  if (
    /^(describe|describe (the )?(scene|room|surroundings|this))$/.test(t) ||
    /\b(what('s| is) (around|in front of|ahead of|near) me|what do you see|what can you see|where am i|what('s| is) (this|here)|look around)\b/.test(t) ||
    /(सामने क्या है|क्या दिख रहा|आसपास क्या)/.test(raw)
  ) {
    return { type: 'describe' };
  }

  return { type: 'ask', query: raw };
}
