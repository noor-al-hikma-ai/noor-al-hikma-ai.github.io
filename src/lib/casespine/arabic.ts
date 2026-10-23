// Arabic surface syntax for CaseSpine. Arabic keywords and SBVR phrases are
// normalised to the canonical English form line-by-line (line numbers are
// preserved), so both languages compile to the identical IR, Lean 4 contract
// and orchestrator. Unknown Arabic text is left untouched and stays readable in
// labels, steps and audit logs.

/** Section / field keys (text before the colon). */
export const AR_KEYS: Record<string, string> = {
  "الحالة": "Case",
  "حالة فرعية": "Subcase",
  "الحالات الفرعية": "Subcases",
  "الإصدار": "Version",
  "المعايير": "Standards",
  "نموذج الحل": "Solution Archetype",
  "مخرج الأعمال": "Business Deliverable",
  "المحرك": "Engine",
  "شريحة العملاء": "Population Segment",
  "المسارات": "Lanes",
  "مزود الدخول الموحد": "SSO Provider",
  "المستخدم": "User",
  "الأدوار": "Roles",
  "التصريح": "Clearance",
  "ملف الحالة": "Case File",
  "المصدر": "Source",
  "عزل النطاق": "Namespace Isolation",
  "المحولات": "Converters",
  "التنقيح": "Curation",
  "العقد الملزم": "Binding Lean Contract",
  "حزم المبرهنات": "Import Theorem Packs",
  "القواعد": "Rules",
  "ضوابط التكلفة والحركة": "Cost & Traffic Guards",
  "سقف الميزانية": "Budget Ceiling",
  "بوابة الفحص المسبق": "Pre-Flight Gate",
  "المحسن التكيفي": "Adaptive Optimizer",
  "حد المعدل": "Rate Limit",
  "المواضيع المسموحة": "Allowed Topics",
  "المواضيع المحظورة": "Banned Topics",
  "سلم النماذج": "Model Ladder",
  "خفض السعة": "Downscaling",
  "الذاكرة الدلالية": "Semantic Cache",
  "قيمة كل نتيجة": "Value Per Outcome",
  "العائد المستهدف": "Target ROI",
  "مسار العملية": "Process Flow",
  "عندما": "When",
  "الخطوات": "Steps",
  "عند الخرق": "On Breach",
  "التصعيد إلى": "Escalate To",
  "بلوغ المعلم": "Reach Milestone",
  "بوابة الخروج": "Exit Gateway",
  "إذا": "If",
  "فإن": "Then",
  "وإلا": "Else",
  "النشر": "Deployment",
  "السحابة": "Cloud",
  "إقامة البيانات": "Residency",
  "الهوية": "Identity",
  "حوكمة البيانات": "Data Governance",
  "المحركات التنفيذية": "Actuators",
};

/** Phrases inside values, rules and steps (longest first is enforced below). */
const AR_PHRASES: [string, string][] = [
  ["يجب أن تكون", "It is obligatory that"],
  ["يجب أن يكون", "It is obligatory that"],
  ["يجب أن يتم", "It is obligatory that"],
  ["يجب أن", "It is obligatory that"],
  ["يُحظر أن تكون", "It is prohibited that"],
  ["يحظر أن تكون", "It is prohibited that"],
  ["يحظر أن يكون", "It is prohibited that"],
  ["يُحظر أن", "It is prohibited that"],
  ["يحظر أن", "It is prohibited that"],
  ["يجوز أن", "It is permitted that"],
  ["قبل المعلم", "before Milestone"],
  ["تغطية الاستشهادات", "citation coverage"],
  ["الرموز المستهلكة", "tokens consumed"],
  ["المتداخلات بين الحالات", "cross-case confounders"],
  ["حجب البيانات الشخصية", "PII is redacted"],
  ["البيانات الشخصية محجوبة", "PII is redacted"],
  ["اتساق المقاطع", "chunk coherence"],
  ["زمن الاستجابة p95", "p95 latency"],
  ["تقادم قائمة العقوبات", "sanctions feed staleness"],
  ["تقييم ضوابط التكلفة والحركة", "Evaluate Cost & Traffic Guards"],
  ["استرجاع", "Retrieve"],
  ["توليف إجابة موثقة", "Synthesize grounded answer"],
  ["توليف", "Synthesize"],
  ["استخراج النصوص والجداول", "Extract prose sections and reconstruct booktabs tables"],
  ["استخراج", "Extract"],
  ["مع استشهادات", "with inline citations"],
  ["باستخدام", "using"],
  ["مع اتساق", "and require coherence"],
  ["حجب", "redact"],
  ["صارم", "strict"],
  ["طلب/دقيقة", "requests/minute"],
  ["طلب/ساعة", "requests/hour"],
  ["لكل مسار", "per Lane"],
  ["عند بقاء الميزانية", "when budget remaining"],
  ["تحققت جميع قواعد العقد الملزم", "all Binding Lean Contract rules hold"],
  ["إصدار إجابة موثقة", "Emit Verified Answer"],
  ["وبلوغ المعلم", "and reach Milestone"],
  ["بلوغ المعلم", "reach Milestone"],
  ["إيقاف وتصعيد إلى", "Halt loudly and Escalate To"],
  ["يتم تحميل ملف الحالة", "Case File is loaded"],
  ["دقيقة", "minutes"],
  ["ساعات", "hours"],
  ["ساعة", "hours"],
  ["رمز", "tokens"],
];

const PHRASES = [...AR_PHRASES].sort((a, b) => b[0].length - a[0].length);
const KEY_ENTRIES = Object.entries(AR_KEYS).sort((a, b) => b[0].length - a[0].length);

const ARABIC_RE = /[؀-ۿ]/;
const INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function hasArabic(s: string): boolean {
  return ARABIC_RE.test(s);
}

function normalizeChars(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(INDIC_DIGITS.indexOf(d)))
    .replace(/،/g, ",")
    .replace(/٪/g, "%")
    .replace(/؛/g, ";")
    .replace(/ـ/g, ""); // tatweel
}

function translatePhrases(s: string): string {
  let out = s;
  // Conjunction "و" joined to a known phrase: "والرموز المستهلكة" -> "and tokens consumed".
  for (const [ar, en] of PHRASES) {
    if (ar.startsWith("ال")) out = out.split("و" + ar).join(" and " + en);
  }
  for (const [ar, en] of PHRASES) out = out.split(ar).join(en);
  // Free-standing conjunction and disjunction.
  out = out.replace(/(^|\s)و(\s)/g, "$1and$2").replace(/(^|\s)أو(\s)/g, "$1or$2");
  return out;
}

/** Normalise one line of Arabic CaseSpine to canonical English CaseSpine. */
export function normalizeArabicLine(line: string): string {
  if (!hasArabic(line) && !/[٠-٩،٪]/.test(line)) return line;
  let s = normalizeChars(line);
  const m = /^(\s*)(-\s+)?(.*)$/.exec(s)!;
  const lead = m[1] + (m[2] ?? "");
  let body = m[3];

  // "المرحلة 1 (…):" -> "Stage 1 (…):"
  body = body.replace(/^المرحلة\s+(\d+)/, "Stage $1");

  // Key before the first colon.
  const km = /^([^:]+?)\s*:(\s+.*|\s*)$/.exec(body);
  if (km) {
    const rawKey = km[1].trim();
    const keyBase = rawKey.replace(/\s*\(.*\)\s*$/, "");
    const paren = rawKey.slice(keyBase.length);
    const hit = KEY_ENTRIES.find(([ar]) => ar === keyBase);
    if (hit) body = hit[1] + paren + ":" + translatePhrases(km[2]);
    else body = translatePhrases(body);
  } else {
    body = translatePhrases(body);
  }
  return lead + body.replace(/\s{2,}/g, " ");
}

export function normalizeArabic(src: string): string {
  return src.split("\n").map(normalizeArabicLine).join("\n");
}
