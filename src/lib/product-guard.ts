// ============================================================
// Wrong-product reply guard (#13). Pure + dependency-free (runs in the browser).
//
// Compares the product FAMILY the admin is about to talk about (their draft)
// against the product families the customer ACTUALLY ordered. If they are
// completely different — e.g. the reply mentions "POCO" but the buyer's orders
// are all "Redmi" — it raises a soft, dismissible warning BEFORE sending.
//
// It is deliberately conservative (warns only on a fully disjoint match) to
// avoid nagging on comparisons/accessories. It never blocks the send.
// ============================================================

// Sub-brand / series tokens common to the shops' catalogues. Each token is an
// independent "family": Redmi and POCO are both Xiaomi yet must NOT be treated
// as equivalent (that mix-up is exactly the bug this guards against).
const FAMILY_TOKENS = [
  'redmi', 'poco', 'pocophone', 'xiaomi', 'mi ',
  'samsung', 'galaxy',
  'oppo', 'reno', 'oppo find',
  'vivo', 'iqoo',
  'realme',
  'iphone', 'apple', 'ipad', 'macbook', 'airpods',
  'huawei', 'honor',
  'infinix', 'tecno', 'itel',
  'nokia', 'asus', 'rog', 'zenfone',
  'oneplus', 'motorola', 'moto ', 'nubia', 'nothing phone', 'google pixel', 'pixel',
];

/** Lowercased set of family tokens present in a text. */
function familiesIn(text: string): Set<string> {
  const t = ` ${(text || '').toLowerCase()} `;
  const found = new Set<string>();
  for (const tok of FAMILY_TOKENS) {
    // token already carries its own spacing intent (e.g. 'mi ', 'moto ')
    const needle = tok.endsWith(' ') ? tok : tok;
    if (t.includes(needle)) found.add(tok.trim());
  }
  return found;
}

export interface OrderedItemLike { item_name?: string | null; model_name?: string | null }

export interface ProductMismatch {
  warn: true;
  said: string[];      // families mentioned in the draft
  ordered: string[];   // families the customer actually ordered
}

/**
 * Returns a mismatch warning, or null when there's nothing to flag.
 * Warns only when BOTH sides have a recognizable family AND they are disjoint.
 */
export function productMismatch(draft: string, orders: OrderedItemLike[] | null | undefined): ProductMismatch | null {
  if (!draft || !orders || !orders.length) return null;

  const said = familiesIn(draft);
  if (!said.size) return null;

  const ordered = new Set<string>();
  for (const o of orders) {
    familiesIn(`${o.item_name || ''} ${o.model_name || ''}`).forEach(f => ordered.add(f));
  }
  if (!ordered.size) return null;

  // Any overlap → the admin is (also) talking about a product the buyer owns → OK.
  for (const f of said) if (ordered.has(f)) return null;

  return { warn: true, said: [...said], ordered: [...ordered] };
}
