import type { AnalysisOfResponse } from "@/lib/types";
import { cleanText } from "@/lib/utils";
import { analyzeSupplierResponse, llmAvailable } from "@/lib/scrape/llm";

// ============================================================
//  Analisis de respuestas de proveedores.
//  Usa LLM si esta disponible; si no, analisis por palabras clave.
// ============================================================

function keyword(text: string, positive: RegExp, negative: RegExp): boolean {
  if (negative && negative.test(text)) return false;
  return positive.test(text);
}

export async function analyzeResponse(
  body: string,
  context: string
): Promise<AnalysisOfResponse> {
  const clean = cleanText(body).slice(0, 8000);

  // Intentar LLM primero
  if (llmAvailable()) {
    try {
      const llm = await analyzeSupplierResponse(clean, context);
      if (llm) {
        return {
          summary: llm.summary,
          classification: llm.classification,
          suggested_reply: llm.suggested_reply,
        };
      }
    } catch {
      // caer a heuristica
    }
  }

  // Heuristica por palabras clave
  const classification: {
    accepts_dropshipping?: boolean;
    gives_price?: boolean;
    gives_moq?: boolean;
    asks_more_info?: boolean;
    rejects?: boolean;
    wants_negotiate?: boolean;
    other?: boolean;
    notes?: string;
  } = {
    accepts_dropshipping: keyword(
      clean,
      /dropship|dropshipping|ship directly|ship direct|support dropshipping|we do dropshipping|drop shipping/i,
      /no dropship|don't support|do not support|not support dropshipping/i
    ),
    gives_price: keyword(clean, /usd\s*\$?\s*\d|€\s*\d|\$\s*\d|price.*(is|as)|costs?\s+\$?€?\s*\d|wholesale price/i, /no price|we cannot provide pricing/i),
    gives_moq: keyword(clean, /moq\s*(is|:|=)?\s*\d+|minimum order( quantity)?\s*(is|:)?\s*\d+|min(imum)? order/i, /no moq/i),
    asks_more_info: keyword(
      clean,
      /could you (please )?(send|provide|share|give)|we need (more|some) (info|information|details)|please (tell|let|send) us|what is your website|can you share|send us (your|more)|please confirm/i,
      /please find|see attached|here is/i
    ),
    rejects: keyword(
      clean,
      /(sorry|afraid|unfortunately).*(not|cannot|can't|unable)|we don't|we cannot|not interested|do not sell|don't sell|we do not (work|offer|provide)/i,
      /we don't sell to the usa|only for eu/i
    ),
    wants_negotiate: keyword(
      clean,
      /negotiat|we can discuss|depends on|let me know your (target|budget|quantity)|how many|what quantity|let's talk/i,
      /no negotiation/i
    ),
  };
  if (!Object.values(classification).some(Boolean)) classification.other = true;
  classification.notes = clean.slice(0, 300);

  const summary = buildSummary(clean, classification);

  return {
    summary,
    classification,
    suggested_reply: buildSuggestedReply(classification, clean),
  };
}

function buildSummary(body: string, c: Record<string, boolean | string | undefined>): string {
  const parts: string[] = [];
  if (c.accepts_dropshipping) parts.push("Aceptan dropshipping.");
  if (c.gives_price) parts.push("Dan precio.");
  if (c.gives_moq) parts.push("Dan MOQ.");
  if (c.asks_more_info) parts.push("Piden mas informacion.");
  if (c.rejects) parts.push("Parece un rechazo.");
  if (c.wants_negotiate) parts.push("Quieren negociar.");
  const head = cleanText(body).slice(0, 120);
  return parts.length
    ? `${parts.join(" ")} Primeras palabras: "${head}..."`
    : `Respuesta recibida. Primeras palabras: "${head}..."`;
}

function buildSuggestedReply(
  c: Record<string, boolean | string | undefined>,
  body: string
): string {
  const asks = (c.asks_more_info || c.wants_negotiate || c.gives_moq || c.gives_price) ? true : !c.rejects;
  if (c.rejects) {
    return `Hello,\n\nThank you for your reply. I understand.\n\nCould you perhaps recommend another product line or a colleague who handles dropshipping?\n\nBest regards,\nFrancisco`;
  }
  return `Hello,\n\nThank you for your quick reply.\n\n${asks ? "To move forward, could you please confirm the following points?" : "That sounds great."}
- Wholesale price
- MOQ
- Shipping cost and delivery time to Spain
- Dropshipping with blind shipping (no supplier invoice/branding)
- Tracking
- Payment methods
- Custom branding/packaging

I am looking for a long-term partnership and I am open to your suggestions.\n\nIf you are interested in working together, I would be happy to share my website and examples of my previous work.\n\nBest regards,\nFrancisco`;
}