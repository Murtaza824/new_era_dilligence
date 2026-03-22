/**
 * Helpers for displaying memo overview and team on company/portfolio pages.
 */

/** Plain-text single paragraph from markdown-ish content (e.g. Company Overview). Capped at ~600 chars. */
export function overviewAsParagraph(content: string): string {
  const text = content
    .replace(/#+\s*/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n+/g, " ")
    .trim();
  if (text.length <= 600) return text;
  const cut = text.lastIndexOf(" ", 600);
  return text.slice(0, cut > 400 ? cut : 600) + "…";
}

export interface Founder {
  name: string;
  linkedInUrl: string | null;
}

/**
 * Parse "Founders:" block from Team & Leadership section content.
 * Expects lines like "Founders:\n- Full Name | URL or -\n"
 */
export function parseFoundersFromTeamContent(content: string): Founder[] {
  const founders: Founder[] = [];
  const lower = content.toLowerCase();
  const idx = lower.indexOf("founders:");
  if (idx === -1) return founders;
  const block = content.slice(idx);
  const lines = block.split(/\n/).slice(1);
  for (const line of lines) {
    const trimmed = line.replace(/^[\s\-*]+/, "").trim();
    if (!trimmed) continue;
    const pipe = trimmed.indexOf("|");
    if (pipe === -1) {
      founders.push({ name: trimmed, linkedInUrl: null });
      continue;
    }
    const name = trimmed.slice(0, pipe).trim();
    let url = trimmed.slice(pipe + 1).trim();
    if (url === "-" || !url || !url.startsWith("http")) url = "";
    founders.push({
      name: name || trimmed,
      linkedInUrl: url || null,
    });
  }
  return founders;
}
