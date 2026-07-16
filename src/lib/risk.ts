// ============================================================
// Risk-word detection (#9). Pure + dependency-free so it runs on the server
// (conversation-list preview scan) AND in the browser (live thread banner).
//
// Flags messages that signal a legal / reputational escalation so the WHOLE
// team is warned before replying — e.g. สคบ., ฟ้อง, ทนาย, ตำรวจ, รีวิว 1 ดาว.
// It never blocks or auto-replies; it only surfaces a warning for a human.
// ============================================================

export type RiskSeverity = 'high' | 'medium';

interface RiskPattern { re: RegExp; label: string; cat: 'legal' | 'reputation' | 'fraud'; sev: RiskSeverity }

// Thai has no word spaces, so most patterns are substring matches. Order matters
// only for the label we surface (first match per pattern). Keep this list tight —
// every term here pops a red banner, so avoid words with innocent everyday uses.
const PATTERNS: RiskPattern[] = [
  // --- legal ---
  { re: /สคบ\.?/i,                 label: 'สคบ.',        cat: 'legal', sev: 'high' },
  { re: /ปคบ\.?/i,                 label: 'ปคบ.',        cat: 'legal', sev: 'high' },
  { re: /ฟ้องร้อง|ฟ้อง/i,          label: 'ฟ้องร้อง',    cat: 'legal', sev: 'high' },
  { re: /ดำเนินคดี/i,             label: 'ดำเนินคดี',   cat: 'legal', sev: 'high' },
  { re: /แจ้งความ/i,              label: 'แจ้งความ',    cat: 'legal', sev: 'high' },
  { re: /ทนายความ|ทนาย/i,         label: 'ทนาย',        cat: 'legal', sev: 'high' },
  { re: /ตำรวจ/i,                 label: 'ตำรวจ',       cat: 'legal', sev: 'high' },
  { re: /พ\.?ร\.?บ\.?/i,          label: 'พ.ร.บ.',      cat: 'legal', sev: 'medium' },
  { re: /ผิดกฎหมาย/i,             label: 'ผิดกฎหมาย',   cat: 'legal', sev: 'medium' },
  { re: /กรมการค้า|สำนักงานคณะกรรมการคุ้มครองผู้บริโภค/i, label: 'หน่วยงานคุ้มครองผู้บริโภค', cat: 'legal', sev: 'high' },
  // --- reputation ---
  { re: /(?:รีวิว|ให้|ให้คะแนน)?\s*1\s*ดาว/i, label: 'รีวิว 1 ดาว', cat: 'reputation', sev: 'high' },
  { re: /รีวิวแย่|รีวิวเสีย/i,     label: 'รีวิวแย่',    cat: 'reputation', sev: 'medium' },
  { re: /ประจาน|แฉ/i,             label: 'ประจาน/แฉ',   cat: 'reputation', sev: 'high' },
  { re: /ลงเพจ|ลงกลุ่ม|ลงเฟส|โพสต์ประจาน|ลงโซเชียล/i, label: 'ขู่โพสต์ประจาน', cat: 'reputation', sev: 'high' },
  // --- fraud / accusation ---
  { re: /หลอกลวง|ต้มตุ๋น|ฉ้อโกง/i, label: 'กล่าวหาหลอกลวง', cat: 'fraud', sev: 'medium' },
  { re: /โกงเงิน|โกงลูกค้า|ร้านโกง/i, label: 'กล่าวหาว่าโกง', cat: 'fraud', sev: 'medium' },
];

export interface RiskHit {
  hit: true;
  severity: RiskSeverity;      // high if any high-severity term matched
  terms: string[];             // distinct human-readable labels
  categories: ('legal' | 'reputation' | 'fraud')[];
}

/** Scan one text. Returns null when nothing risky is found. */
export function detectRisk(text: string | null | undefined): RiskHit | null {
  const t = (text || '').toString();
  if (!t) return null;
  const terms = new Set<string>();
  const cats = new Set<'legal' | 'reputation' | 'fraud'>();
  let severity: RiskSeverity = 'medium';
  for (const p of PATTERNS) {
    if (p.re.test(t)) {
      terms.add(p.label);
      cats.add(p.cat);
      if (p.sev === 'high') severity = 'high';
    }
  }
  if (!terms.size) return null;
  return { hit: true, severity, terms: [...terms], categories: [...cats] };
}

/** Scan several texts (e.g. all customer messages in a thread) and merge hits. */
export function detectRiskIn(texts: (string | null | undefined)[]): RiskHit | null {
  const terms = new Set<string>();
  const cats = new Set<'legal' | 'reputation' | 'fraud'>();
  let severity: RiskSeverity | null = null;
  for (const txt of texts) {
    const h = detectRisk(txt);
    if (!h) continue;
    h.terms.forEach(x => terms.add(x));
    h.categories.forEach(x => cats.add(x));
    if (h.severity === 'high') severity = 'high';
    else if (!severity) severity = 'medium';
  }
  if (!terms.size || !severity) return null;
  return { hit: true, severity, terms: [...terms], categories: [...cats] };
}
