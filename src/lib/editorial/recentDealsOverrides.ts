/** Hand-researched recent-deals blurbs (override auto-generated text on backfill). */
export const RECENT_DEALS_OVERRIDES: Record<string, string> = {
  AMD: "AMD (AMD)'s narrative centers on scaling MI300-class data-center GPUs and ROCm alongside EPYC server CPUs, with Xilinx contributing embedded, adaptive, and networking silicon. Customer momentum usually shows up as hyperscaler and enterprise AI deployments, incremental server wins, and advanced-packaging roadmaps with manufacturing partners rather than one defining \"marquee\" partnership.",
  NVDA: "NVIDIA (NVDA)'s recent deals center on locking in gigawatt-scale AI infrastructure: a landmark OpenAI deployment (10+ GW, large staged NVIDIA investment), Microsoft–NVIDIA support for Anthropic on Azure, and expanding ties with Adobe, Lilly, and Coherent for models, biopharma AI, and datacenter optics. IREN, Oracle, and HUMAIN add neocloud and sovereign AI capacity—cementing NVIDIA as the default compute layer for the next wave of training clusters and national AI programs.",
}

/** Legacy / model blurbs that tell users to “check IR” instead of saying anything concrete. */
export function isGenericRecentDealsFiller(text: string): boolean {
  const t = text.trim()
  if (t.length < 50) return false
  if (/\bbest tracked through investor relations\b/i.test(t)) return true
  if (/\bthis automated summary highlights\b/i.test(t)) return true
  if (/\bshould be refreshed periodically\b/i.test(t)) return true
  if (/\bsec filings\b/i.test(t) && /\bautomated summary\b/i.test(t)) return true
  return false
}
