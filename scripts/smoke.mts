import { generateEmail, pickBestContact } from "../src/lib/email/message-generator";
import { analyzeResponse } from "../src/lib/email/analysis";
import { parseAliExpress } from "../src/lib/scrape/aliexpress";
import { parseGenericPage } from "../src/lib/scrape/generic";
import { extractEmails, extractPhones, extractAliExpressId } from "../src/lib/utils";
import { encrypt, decrypt } from "../src/lib/crypto";

function assert(cond: boolean, label: string) {
  if (!cond) {
    console.error(`  FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`  ok: ${label}`);
  }
}

// 1) Utils
console.log("== utils ==");
assert(extractAliExpressId("https://es.aliexpress.com/item/1005001234567890.html") === "1005001234567890", "extract id");
assert(extractEmails("contact a@b.com and c@d.co plus bad@example.com").length === 2, "extract emails filtra example.com");
assert(extractPhones("call +86 10 1234 5678 or 8613912345678").length >= 1, "extract phones");

// 2) Generador de email
console.log("== message generator ==");
const contact = { company: "Shenzhen Camelot Intelligent Technology Co., Ltd.", contact_type: "fabricante" as const, email: "sales@camelot.com", confidence: "alta" as const };
const email = generateEmail(contact, { productName: "Wireless Earbuds Pro", productUrl: "https://aliexpress.com/item/1.html" });
assert(email.subject.startsWith("Wholesale & Dropshipping inquiry"), "asunto");
assert(email.body.includes("My name is Francisco, a web developer and automation specialist based in Spain."), "presentacion Francisco");
assert(email.body.includes("If you are interested in working together, I would be happy to share my website and examples of my previous work."), "frase web");
assert(email.body.includes("1. Wholesale price"), "pregunta wholesale");
assert(email.body.includes("10. Long-term cooperation possibilities"), "pregunta largo plazo");
assert(!/francisco\.|mysite\.|miweb\.|portfolio\./i.test(email.body), "no menciona su web personal");
const best = pickBestContact([
  { contact_type: "vendedor" as const, email: undefined },
  { company: "Fabricante X", contact_type: "fabricante" as const, email: "x@y.com", confidence: "alta" as const },
]);
assert(best?.email === "x@y.com", "pickBestContact elige fabricante con email");

// 3) Analisis de respuesta (heuristica)
console.log("== response analysis ==");
const a = await analyzeResponse(
  "Hello Francisco, yes we support dropshipping. The wholesale price is $12.50, MOQ 100 pieces. Shipping to Spain is free over 500 USD.",
  "our initial request"
);
assert(a.classification.accepts_dropshipping === true, "acepta dropshipping");
assert(a.classification.gives_price === true, "da precio");
assert(a.classification.gives_moq === true, "da moq");
assert(!!a.suggested_reply, "respuesta sugerida");
const r = await analyzeResponse("We are sorry but we do not offer dropshipping at the moment.", "");
assert(r.classification.rejects === true || r.classification.accepts_dropshipping === false, "rechaza");

// 4) Parser AliExpress (HTML simulado con runParams)
console.log("== aliexpress parser ==");
const fixture = `
<html><head><title>Wireless Earbuds Pro | AliExpress</title>
<meta property="og:title" content="Wireless Earbuds Pro">
<meta property="og:image" content="https://img.example.com/earbuds.jpg">
</head><body>
<script>
window.runParams = {"data":{"productInfoComponent":{"id":1005001234567890,"subject":"Wireless Earbuds Pro","formatedPrice":"US $12.50","currencyCode":"USD","variations":[{"name":"Black"},{"name":"White"}]},"logisticsInfoComponent":{"logisticsInfo":[{"deliveryTimeDesc":"10-15 days","freightAmount":{"formatedAmount":"Free"}}]},"store":{"storeName":"TechGadget Store","storeUrl":"https://aliexpress.com/store/12345"},"sellerCompanyInfo":{"companyName":"Shenzhen Camelot Intelligent Technology Co., Ltd.","registeredAddress":"Baoan District, Shenzhen, Guangdong, China","email":"sales@camelot.com","phone":"+86 755 1234 5678"}}};
</script>
<div class="store-name">TechGadget Store</div>
<p>Responsible in the EU: EU Import Services GmbH, Berlin, Germany</p>
<p>Contact information: Shenzhen Camelot Intelligent Technology Co., Ltd. Baoan District, Shenzhen support@camelot.cn</p>
</body></html>`;
const parsed = parseAliExpress(fixture, "https://es.aliexpress.com/item/1005001234567890.html");
assert(parsed.product_id === "1005001234567890", "product id");
assert(parsed.name === "Wireless Earbuds Pro", "nombre");
assert(parsed.price === "US $12.50", "precio");
assert(parsed.seller_name === "TechGadget Store", "vendedor");
assert(parsed.manufacturer_name === "Shenzhen Camelot Intelligent Technology Co., Ltd.", "fabricante");
assert(parsed.manufacturer_email === "sales@camelot.com", "email fabricante");
assert(parsed.manufacturer_phone === "+86 755 1234 5678", "telefono fabricante");
assert(parsed.eu_responsible?.includes("EU Import Services GmbH"), "responsable UE");
assert(parsed.variants?.some((v) => v.name === "Black"), "variantes");
assert(parsed.shipping_info?.includes("10-15 days"), "envio: tiempo");
assert(parsed.shipping_info?.includes("Free"), "envio: coste");
assert((parsed.contacts || []).length >= 3, "contactos");
assert(parsed.contacts?.some((c) => c.email === "support@camelot.cn"), "email de conformidad");

// 5) Parser generico
console.log("== generic parser ==");
const g = parseGenericPage(
  '<html><head><title>Acme Manufacturing Co.</title><meta name="description" content="LED manufacturer"></head><body><h1>Acme Manufacturing Co.</h1><p>Contact: hello@acme.com or +86 20 8888 8888</p></body></html>',
  "https://acme.com"
);
assert(g.company === "Acme Manufacturing Co.", "compania generica");
assert(g.emails.includes("hello@acme.com"), "email generico");

// 6) Criptografia
console.log("== crypto ==");
const enc = encrypt("refresh_token_123");
assert(enc !== "refresh_token_123", "encriptado");
assert(decrypt(enc) === "refresh_token_123", "desencriptado");

console.log("\nSmoke test terminado.");