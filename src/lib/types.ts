// ============================================================
//  Tipos de dominio compartidos
// ============================================================

export type ContactType = "fabricante" | "proveedor" | "vendedor" | "eu_responsible";

export type Confidence = "alta" | "media" | "baja";

// Una fuente de datos usada para obtener la informacion del producto.
export interface DataSource {
  type: string; // pagina_aliexpress | conformidad_aliexpress | api_producto | busqueda_web | busqueda_fabricante | captura_navegador
  url?: string;
  title?: string;
  confidence: Confidence;
}

export interface Contact {
  id?: string;
  company?: string;
  contact_type: ContactType;
  email?: string;
  website?: string;
  phone?: string;
  address?: string;
  source?: string;
  confidence?: Confidence;
  metadata?: Record<string, unknown>;
}

export interface ManufacturerSource {
  title?: string;
  url?: string;
  kind?: string;
  snippet?: string;
  email?: string;
}

// Datos extraidos de la pagina del producto
export interface ExtractedProduct {
  url: string;
  product_id?: string;
  name?: string;
  image_url?: string;
  seller_name?: string;
  seller_store_url?: string;
  seller_email?: string;
  seller_phone?: string;
  seller_address?: string;
  manufacturer_name?: string;
  manufacturer_address?: string;
  manufacturer_email?: string;
  manufacturer_phone?: string;
  eu_responsible?: string;
  price?: string;
  currency?: string;
  variants?: Array<{ name?: string; price?: string }>;
  shipping_info?: string;
  compliance_contacts?: Contact[];
  contacts?: Contact[];
  manufacturer_sources?: ManufacturerSource[];
  raw_html?: string;
  extraction_method?: string;
  warnings?: string[];
  // Fuentes de datos usadas y nivel de confianza por campo
  brand?: string;
  country?: string;
  manufacturer_verified?: boolean;
  manufacturer_confidence?: Confidence;
  compliance_text?: string;
  source_log?: DataSource[];
}

// Informe estructurado que recibe el frontend. Diferencia vendedor/marca/fabricante
// y marca si el fabricante esta verificado o no (nunca se presenta una inferencia
// como dato confirmado).
export interface ProductReport {
  success: boolean;
  url: string;
  product_id?: string;
  title?: string;
  image_url?: string;
  price?: string;
  currency?: string;
  store?: string;
  seller: {
    name?: string;
    email?: string;
    store_url?: string;
    confidence: Confidence;
  };
  brand: {
    name?: string;
    confidence: Confidence;
  };
  manufacturer: {
    name?: string;
    legal_name?: string;
    email?: string;
    address?: string;
    country?: string;
    phone?: string;
    verified: boolean;
    confidence: Confidence;
  };
  compliance: {
    available: boolean;
    source?: string;
    text?: string;
    eu_responsible?: string;
  };
  sources: DataSource[];
  warnings: string[];
}

export interface AnalysisResult {
  product: ExtractedProduct;
  method: string;
  success: boolean;
  error?: string;
}

export type SupplierStatus =
  | "pendiente"
  | "contactado"
  | "respondido"
  | "negociando"
  | "aceptado"
  | "rechazado";

export interface Supplier {
  id: string;
  company?: string;
  product_id?: string;
  contact_id?: string;
  product_name?: string;
  contact_email?: string;
  contact_type?: string;
  status: SupplierStatus;
  notes?: string;
  first_contact_date?: string;
  last_message?: string;
  next_follow_up?: string;
  created_at?: string;
}

export interface PreparedEmail {
  id?: string;
  to_email?: string;
  subject?: string;
  body?: string;
  status?: "draft" | "copied" | "sent";
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  date: string;
  bodyText: string;
  references?: string;
  inReplyTo?: string;
}

export interface ResponseClassification {
  accepts_dropshipping?: boolean;
  gives_price?: boolean;
  gives_moq?: boolean;
  asks_more_info?: boolean;
  rejects?: boolean;
  wants_negotiate?: boolean;
  other?: boolean;
  notes?: string;
}

export interface AnalysisOfResponse {
  summary?: string;
  classification: ResponseClassification;
  suggested_reply?: string;
}

export interface DashboardStats {
  products: number;
  contacts: number;
  emails: number;
  emailed: number;
  contacted: number;
  pendingResponses: number;
  responded: number;
  byStatus: Record<string, number>;
  notifications: Array<{
    id: string;
    title: string;
    body: string;
    created_at: string;
    is_read: boolean;
  }>;
}