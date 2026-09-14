const LEVELS = new Set(["high", "medium", "low", "info"]);

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

/** Page ranges and location hints are not reliable page coordinates. */
export function parseDocumentPage(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(?:page\s+)?(\d+)$/i);
  if (!match) return null;
  const page = Number(match[1]);
  return Number.isSafeInteger(page) && page > 0 ? page : null;
}

function severity(value) {
  const level = cleanText(value).toLowerCase();
  return LEVELS.has(level) ? level : "info";
}

function location(item) {
  let sheet = cleanText(item.sheet) || null;
  let cell = cleanText(item.cell) || cleanText(item.cell_reference);
  // A combined location is accepted only when it names one sheet and one cell.
  const combined = cell.match(/^(?:'((?:[^']|'')+)'|([^!]+))!(\$?[A-Z]+\$?[1-9]\d*)$/i);
  if (combined) {
    const namedSheet = combined[1]?.replace(/''/g, "'") || combined[2].trim();
    if (sheet && sheet !== namedSheet) return { sheet, cell: null };
    sheet = namedSheet;
    cell = combined[3];
  }
  cell = /^\$?[A-Z]+\$?[1-9]\d*$/i.test(cell) ? cell.replace(/\$/g, "").toUpperCase() : null;
  return { sheet, cell };
}

function equivalentText(value) {
  return cleanText(value).normalize("NFKC").toLowerCase()
    .replace(/^ai\s+draft\s*:\s*/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Findings belong to the selected attachment, never to a request's other files. */
export function getDocumentReviewFindings(document) {
  if (!document || typeof document !== "object") return [];
  const review = document.aiReviewResult || {};
  const prefix = cleanText(document.id) || cleanText(document.url) || cleanText(document.name) || "document";
  const findings = [];
  const reviewTexts = new Set();

  function append(item, kind, index, fields) {
    const finding = {
      id: `${prefix}:${kind}:${index}`,
      kind,
      severity: severity(item.risk_level || item.severity),
      ...fields,
      quote: cleanText(item.clause_text),
      page: parseDocumentPage(item.page),
      ...location(item),
    };
    findings.push(finding);
    reviewTexts.add(equivalentText(`${finding.title}: ${finding.description}`));
    if (finding.description.length >= 20) reviewTexts.add(equivalentText(finding.description));
  }

  list(review.risk_highlights).forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const title = cleanText(item.term) || "Risk identified";
    const description = cleanText(item.reason);
    if (!description && !cleanText(item.term) && !cleanText(item.clause_text)) return;
    append(item, "risk", index, { title, description, missing: false });
  });

  list(review.missing_or_unusual_clauses).forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const title = cleanText(item.clause_title) || "Clause requires review";
    const description = cleanText(item.explanation);
    if (!description && !cleanText(item.clause_title) && !cleanText(item.clause_text)) return;
    append(item, "clause", index, {
      title,
      description,
      missing: /^missing\b/i.test(cleanText(item.issue_type)),
    });
  });

  list(document.aiSuggestions).forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const description = cleanText(item.text);
    if (!description || reviewTexts.has(equivalentText(description))) return;
    const type = cleanText(item.type);
    const riskLevel = type.match(/^risk\s*:\s*(high|medium|low|info)$/i)?.[1];
    append({ ...item, risk_level: item.risk_level || riskLevel }, "suggestion", index, {
      title: type || "Review suggestion",
      description,
      missing: /^missing\b/i.test(type),
    });
  });
  return findings;
}

function normalizedCharacter(character) {
  return character.normalize("NFKC").toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
}

function normalizedQuote(value) {
  let quote = Array.from(cleanText(value), normalizedCharacter).join("").replace(/\s+/gu, " ").trim();
  // Models sometimes wrap an otherwise verbatim passage in quotation marks.
  if ((quote.startsWith('"') && quote.endsWith('"')) || (quote.startsWith("'") && quote.endsWith("'"))) {
    quote = quote.slice(1, -1).trim();
  }
  return quote;
}

function specificQuote(quote) {
  const words = quote.match(/[\p{L}\p{N}]+/gu) || [];
  return quote.length >= 20 && words.length >= 3 && words.join("").length >= 15;
}

function indexedPdfText(textContent) {
  const characters = [];
  const offsets = [];
  list(textContent?.items).forEach((item, itemIndex) => {
    if (typeof item?.str !== "string" || !item.str) return;
    if (characters.length) {
      // PDF runs can split either a word or a space between words.
      characters.push("\0");
      offsets.push(null);
    }
    let offset = 0;
    for (const original of item.str) {
      const start = offset;
      offset += original.length;
      for (const character of normalizedCharacter(original)) {
        const normalized = /\s/u.test(character) ? " " : character;
        if (normalized === " " && characters.at(-1) === " ") continue;
        // Map every normalized code unit back to the original UTF-16 string.
        for (let unit = 0; unit < normalized.length; unit += 1) {
          characters.push(normalized[unit]);
          offsets.push({ itemIndex, start, end: offset });
        }
      }
    }
    if (item.hasEOL && characters.at(-1) !== " ") {
      characters.push(" ");
      offsets.push(null);
    }
  });
  return { text: characters.join(""), offsets };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function adjacentCharacter(text, offset, direction) {
  while (offset >= 0 && offset < text.length && text[offset] === "\0") offset += direction;
  return text[offset] || "";
}

/**
 * Return actual quoted-text ranges, with end-exclusive offsets into each PDF item.
 * Labels, inferred page regions, and missing clauses never become painted text.
 */
export function matchPdfTextHighlights(textContent, findings, pageNumber) {
  const page = parseDocumentPage(pageNumber);
  if (!page) return [];
  const { text, offsets } = indexedPdfText(textContent);
  if (!text) return [];
  const ranges = [];
  const seen = new Set();
  for (const finding of list(findings)) {
    if (!finding || finding.missing) continue;
    const findingPage = parseDocumentPage(finding.page);
    if (findingPage && findingPage !== page) continue;
    const quote = normalizedQuote(finding.quote);
    if (!specificQuote(quote)) continue;
    const pattern = Array.from(quote, (character) => character === " " ? "[ \\x00]+" : escapeRegex(character)).join("\\x00*");
    const matcher = new RegExp(pattern, "gu");
    for (const match of text.matchAll(matcher)) {
      const start = match.index;
      const end = start + match[0].length;
      // Do not match a quote inside a longer word with a different meaning.
      if (/^[\p{L}\p{N}]/u.test(quote) && /[\p{L}\p{N}]/u.test(adjacentCharacter(text, start - 1, -1))) continue;
      if (/[\p{L}\p{N}]$/u.test(quote) && /[\p{L}\p{N}]/u.test(adjacentCharacter(text, end, 1))) continue;
      const byItem = new Map();
      for (let index = start; index < end; index += 1) {
        const source = offsets[index];
        if (!source) continue;
        const range = byItem.get(source.itemIndex);
        if (range) range.end = Math.max(range.end, source.end);
        else byItem.set(source.itemIndex, { findingId: finding.id, ...source, severity: severity(finding.severity) });
      }
      for (const range of byItem.values()) {
        const key = `${range.findingId}:${range.itemIndex}:${range.start}:${range.end}`;
        if (!seen.has(key)) ranges.push(range);
        seen.add(key);
      }
    }
  }
  return ranges;
}
