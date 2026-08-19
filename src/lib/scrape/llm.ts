// ============================================================
//  Extraccion / analisis con LLM (opcional).
//  Solo se usa si OPENAI_API_KEY esta definida. Si no hay clave
//  o falla, el resto del sistema funciona con extraccion local.
// ============================================================

const API_URL = "https://api.openai.com/v1/chat/completions";

export function llmAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

async function chat(prompt: string, json: boolean, maxTokens = 1200): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!key) return null;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          {
            role: "system",
            content: json
              ? "You are a precise data extraction assistant. Respond ONLY with valid JSON, no markdown fences."
              : "You are a precise assistant. Respond with plain text only.",
          },
          { role: "user", content: prompt },
        ],
        response_format: json ? { type: "json_object" } : undefined,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

export interface LLMProductExtraction {
  product_name?: string;
  seller?: string;
  manufacturer?: string;
  manufacturer_address?: string;
  manufacturer_email?: string;
  manufacturer_phone?: string;
  eu_responsible?: string;
  price?: string;
  currency?: string;
  variants?: Array<{ name: string; price?: string }>;
  shipping_info?: string;
  contacts?: Array<{
    company?: string;
    type?: string;
    email?: string;
    website?: string;
    phone?: string;
  }>;
}

export async function extractProductWithLLM(pageText: string, url: string): Promise<LLMProductExtraction | null> {
  if (!llmAvailable()) return null;
  const prompt = `Extract structured data about this product and its seller/manufacturer from the following page content.

URL: ${url}

Rules:
- Only use information actually present. If something is missing, OMIT the field.
- Distinguish clearly between: seller (AliExpress store), manufacturer (maker of the product) and EU responsible (person/company responsible in the EU).
- Extract any emails, phones, addresses, company names.
- "price" as plain text, "currency" as ISO code.

Return a JSON object with keys: product_name, seller, manufacturer, manufacturer_address, manufacturer_email, manufacturer_phone, eu_responsible, price, currency, variants (array of {name, price}), shipping_info, contacts (array of {company, type, email, website, phone}).

PAGE CONTENT (truncated):
${pageText.slice(0, 12000)}`;

  const raw = await chat(prompt, true, 1500);
  if (!raw) return null;
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return parsed as LLMProductExtraction;
  } catch {
    return null;
  }
}

export interface LLMResponseAnalysis {
  summary: string;
  classification: {
    accepts_dropshipping?: boolean;
    gives_price?: boolean;
    gives_moq?: boolean;
    asks_more_info?: boolean;
    rejects?: boolean;
    wants_negotiate?: boolean;
    other?: boolean;
    notes?: string;
  };
  suggested_reply: string;
}

export async function analyzeSupplierResponse(text: string, context: string): Promise<LLMResponseAnalysis | null> {
  if (!llmAvailable()) return null;
  const prompt = `You received a reply from a supplier/dropshipping candidate. Analyze it.

Context (our initial request): ${context.slice(0, 1500)}

Reply received:
---
${text.slice(0, 6000)}
---

Return a JSON object:
{
  "summary": "2-3 sentence summary in English",
  "classification": {
    "accepts_dropshipping": bool,
    "gives_price": bool,
    "gives_moq": bool,
    "asks_more_info": bool,
    "rejects": bool,
    "wants_negotiate": bool,
    "other": bool,
    "notes": "short note"
  },
  "suggested_reply": "A short professional reply in English asking the remaining key questions and thanking them. Plain text."
}`;

  const raw = await chat(prompt, true, 1200);
  if (!raw) return null;
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as LLMResponseAnalysis;
  } catch {
    return null;
  }
}