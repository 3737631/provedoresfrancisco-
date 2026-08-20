import type { Contact, Confidence, ExtractedProduct, ProductReport } from "@/lib/types";
import { cleanText } from "@/lib/utils";

// ============================================================
//  Construye el informe estructurado que recibe el frontend.
//  Separa vendedor / marca / fabricante / conformidad y asigna a
//  cada dato su nivel de confianza. NUNCA presenta una inferencia
//  como dato confirmado: si el fabricante no esta verificado, se
//  devuelve "Fabricante no verificado".
//  Confianza:
//   - ALTA:  informacion oficial de conformidad / fabricante.
//   - MEDIA: fuente publica fiable que coincide con el producto.
//   - BAJA:  inferida por coincidencias de nombre/producto.
// ============================================================

export function buildProductReport(product: ExtractedProduct): ProductReport {
  const warnings = [...(product.warnings || [])];

  const sellerConfidence: Confidence = product.seller_email ? "media" : "baja";
  const sellerContact = bestContact(product, "vendedor");

  const manufacturerVerified = Boolean(product.manufacturer_verified);
  const manufacturerConfidence: Confidence =
    product.manufacturer_confidence ||
    (product.manufacturer_email ? "alta" : product.manufacturer_name ? "media" : "baja");

  const complianceAvailable = Boolean(
    (product.compliance_contacts?.length || 0) > 0 ||
      product.manufacturer_verified ||
      product.eu_responsible ||
      product.compliance_text
  );
  const complianceSource = complianceSourceLabel(product);

  const report: ProductReport = {
    success: true,
    url: product.url,
    product_id: product.product_id,
    title: product.name,
    image_url: product.image_url,
    price: product.price,
    currency: product.currency,
    store: product.seller_name,
    seller: {
      name: product.seller_name,
      email: product.seller_email || sellerContact?.email,
      store_url: product.seller_store_url,
      confidence: sellerConfidence,
    },
    brand: {
      name: cleanBrand(product.brand),
      confidence: product.brand ? "media" : "baja",
    },
    manufacturer: {
      name: product.manufacturer_name,
      legal_name: manufacturerVerified ? product.manufacturer_name : undefined,
      email: product.manufacturer_email,
      address: product.manufacturer_address,
      country: deriveCountry(product.manufacturer_address),
      phone: product.manufacturer_phone,
      verified: manufacturerVerified,
      confidence: manufacturerConfidence,
    },
    compliance: {
      available: complianceAvailable,
      source: complianceSource,
      text: product.compliance_text,
      eu_responsible: product.eu_responsible,
    },
    sources: product.source_log || [],
    warnings,
  };

  if (!manufacturerVerified && !product.manufacturer_name && !report.warnings.some((w) => w.includes("verificado"))) {
    report.warnings.push("No se ha podido verificar el fabricante de este producto.");
  }
  report.warnings = [...new Set(report.warnings)];

  return report;
}

function bestContact(product: ExtractedProduct, type: string): Contact | undefined {
  return (product.contacts || []).find((c) => c.contact_type === type && c.email);
}

function complianceSourceLabel(product: ExtractedProduct): string | undefined {
  const source = (product.contacts || []).find(
    (c) => c.source && /conformidad/i.test(c.source)
  )?.source;
  if (source) return source;
  if (product.compliance_text) return "Información sobre conformidad del producto (AliExpress)";
  if (product.manufacturer_verified) return "Información sobre conformidad del producto (AliExpress)";
  if (product.eu_responsible) return "Página del producto (AliExpress)";
  return undefined;
}

function cleanBrand(brand?: string): string | undefined {
  if (!brand) return undefined;
  const v = cleanText(brand);
  if (/aliexpress|no brand|sin marca|ali express/i.test(v)) return undefined;
  return v.length >= 2 ? v : undefined;
}

// Pais derivado EXCLUSIVAMENTE de la direccion presente (nunca se inventa).
const COUNTRY_HINTS: Array<[RegExp, string]> = [
  [/\bchina\b/i, "China"],
  [/\bzhongshan|shenzhen|guangzhou|dongguan|hangzhou|ningbo|wenzhou|yiwu|pujiang|zhejiang|guangdong|jiangsu|fujian|shanghai|beijing|qingdao|jinhua\b/i, "China"],
  [/\bspain|espa[ñn]a\b/i, "España"],
  [/\bgermany|deutschland\b/i, "Alemania"],
  [/\bfrance\b/i, "Francia"],
  [/\bitaly\b/i, "Italia"],
  [/\bunited kingdom|uk|england\b/i, "Reino Unido"],
  [/\busa\b|\bu\.?s\.?a\.?\b|\bunited states\b/i, "Estados Unidos"],
  [/\bvietnam\b/i, "Vietnam"],
  [/\bindia\b/i, "India"],
  [/\bjapan\b/i, "Japón"],
  [/\bpoland\b/i, "Polonia"],
  [/\bnetherlands|holland\b/i, "Países Bajos"],
  [/\bturkey|türkiye\b/i, "Turquía"],
  [/\bmexico\b/i, "México"],
];

export function deriveCountry(address?: string): string | undefined {
  if (!address) return undefined;
  for (const [re, country] of COUNTRY_HINTS) {
    if (re.test(address)) return country;
  }
  return undefined;
}