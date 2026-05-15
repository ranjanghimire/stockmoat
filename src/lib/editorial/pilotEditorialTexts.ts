/**
 * Hand-researched pilot blurbs (5 symbols) for format QA — replace with LLM or news pipeline later.
 * Keys: uppercase symbol.
 */
import type { GeneratedEditorial } from './generateEditorialFromProfile'

export const PILOT_EDITORIAL_BY_SYMBOL: Record<string, GeneratedEditorial> = {
  ADTX: {
    moatBody: 'Aditxt (ADTX) does not currently have a clear competitive moat.',
    howTheyMakeMoneyBody:
      'Aditxt (ADTX) makes money by developing and licensing immune‑monitoring and immune‑modulation technologies, though revenues are limited and early‑stage.',
    recentDealsBody:
      'Aditxt (ADTX) has not publicly announced material partnerships or commercial deals.',
  },
  AEHL: {
    moatBody:
      'Antelope Enterprise (AEHL) does not yet demonstrate a durable competitive moat; it is repositioning from legacy ceramics into U.S. power sales and digital assets, where scale and execution still need to be proven.',
    howTheyMakeMoneyBody:
      'Antelope Enterprise (AEHL) makes money by selling electricity from its U.S. energy operations, participating in cryptocurrency treasury activity after capital raises, and through its stake in a China‑based livestreaming e‑commerce business.',
    recentDealsBody:
      'Antelope Enterprise’s (AEHL) most visible recent corporate actions include announcing sold‑out early power capacity in Texas (2024), U.S. market entry via an energy‑sector acquisition, and a July 2025 strategic financing agreement (reported around $50 million with Streeterville Capital) framed for Bitcoin purchases — distinct from large strategic tie‑ups with hyperscalers or integrated utilities.',
  },
  AGLE: {
    moatBody:
      'Aeglea BioTherapeutics (AGLE) does not have a proven commercial moat today; value rests on clinical‑stage immunology antibodies and execution versus larger IBD competitors.',
    howTheyMakeMoneyBody:
      'Aeglea (AGLE) is a clinical‑stage biotech and does not yet earn meaningful product revenue; it funds operations through financings and partnership economics tied to pipeline progress.',
    recentDealsBody:
      'Aeglea’s (AGLE) most consequential recent deal was the acquisition of Spyre Therapeutics, announced June 22, 2023, which brought in immunology antibody programs (including SPY001 and SPY002) and was accompanied by a large private placement (reported roughly $210 million gross) that materially increased the company’s cash runway.',
  },
  PLTR: {
    moatBody:
      'Palantir (PLTR)’s moat comes from deeply embedded enterprise and government software, high switching costs around data integration and ontology‑driven workflows, and a track record of large, multi‑year deployments.',
    howTheyMakeMoneyBody:
      'Palantir (PLTR) makes money by selling subscription software (Gotham, Foundry, and AIP) and related professional services, primarily to government agencies and commercial institutions.',
    recentDealsBody:
      'Palantir (PLTR) regularly announces expanded government and commercial adoption of its platforms (including AIP); specific contract headlines vary by quarter — material wins are detailed in SEC filings and earnings releases rather than a single defining partnership sentence.',
  },
  SAVA: {
    moatBody:
      'Cassava Sciences (SAVA) does not have an established commercial moat; its thesis depends on clinical and regulatory outcomes for Alzheimer’s candidates and associated intellectual property.',
    howTheyMakeMoneyBody:
      'Cassava Sciences (SAVA) is a clinical‑stage company with minimal product revenue; it funds R&D through capital markets and any collaboration economics tied to its investigational programs.',
    recentDealsBody:
      'Cassava Sciences (SAVA) has not highlighted large, revenue‑bearing strategic alliances comparable to major pharma co‑development deals; investors rely on trial updates, regulatory correspondence, and filings for partnership or licensing developments.',
  },
}

export function pilotEditorialForSymbol(symbol: string): GeneratedEditorial | null {
  const s = symbol.trim().toUpperCase()
  return PILOT_EDITORIAL_BY_SYMBOL[s] ?? null
}
