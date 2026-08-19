import type { Contact } from "@/lib/types";
import { cleanText } from "@/lib/utils";

// ============================================================
//  Generador del mensaje de contacto (ingles).
// ============================================================

const QUESTIONS = [
  "Wholesale price",
  "MOQ",
  "Shipping cost to Spain",
  "Delivery time to Spain",
  "Dropshipping",
  "Blind shipping / no supplier invoice or branding",
  "Tracking",
  "Payment methods",
  "Custom branding/packaging",
  "Long-term cooperation possibilities",
];

export interface GeneratedEmail {
  subject: string;
  body: string;
}

export function pickBestContact(contacts: Contact[]): Contact | null {
  if (!contacts.length) return null;
  const rank = (c: Contact): number => {
    let score = 0;
    if (c.email) score += 100;
    if (c.contact_type === "fabricante") score += 50;
    else if (c.contact_type === "proveedor") score += 30;
    else if (c.contact_type === "eu_responsible") score += 40;
    else score += 5;
    if (c.confidence === "alta") score += 25;
    else if (c.confidence === "media") score += 10;
    if (c.company) score += 10;
    return score;
  };
  return [...contacts].sort((a, b) => rank(b) - rank(a))[0];
}

export function generateSubject(productName?: string): string {
  const base = productName ? cleanText(productName).slice(0, 60) : "Product";
  return `Wholesale & Dropshipping inquiry: ${base}`;
}

export function generateBody(opts: {
  productName?: string;
  productUrl?: string;
  companyName?: string;
}): string {
  const { productName, productUrl, companyName } = opts;
  const greeting = companyName ? `Dear ${companyName} team,` : "Hello,";

  const productLine = productName
    ? `I am interested in your product: "${cleanText(productName).slice(0, 80)}".`
    : `I am interested in the product I saw on your store.`;

  const questions = QUESTIONS.map((q, i) => `  ${i + 1}. ${q}`).join("\n");

  return `${greeting}

My name is Francisco, a web developer and automation specialist based in Spain.

I found ${productLine}
${productUrl ? `You can see the product here: ${productUrl}\n` : ""}
I am interested in selling this product to Spanish businesses, and I would like to work directly with the manufacturer/supplier.

I am particularly interested in dropshipping and I am looking for a long-term business relationship.

Could you please share the following information?

${questions}

If you are interested in working together, I would be happy to share my website and examples of my previous work.

Thank you for your time, and I look forward to your reply.

Best regards,
Francisco
Web developer & automation specialist
Spain`;
}

export function generateEmail(
  contact: Contact,
  opts: { productName?: string; productUrl?: string }
): GeneratedEmail {
  return {
    subject: generateSubject(opts.productName),
    body: generateBody({
      productName: opts.productName,
      productUrl: opts.productUrl,
      companyName: contact.company,
    }),
  };
}