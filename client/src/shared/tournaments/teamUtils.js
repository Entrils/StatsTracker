export const TOURNAMENT_TEAM_FORMATS = ["1x1", "2x2", "3x3", "5x5"];
export const TEAM_CREATION_FORMATS = ["2x2", "3x3", "5x5"];

export const TEAM_COUNTRY_FALLBACK_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS",
  "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
  "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE",
  "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF",
  "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM",
  "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM",
  "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC",
  "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK",
  "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA",
  "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG",
  "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO",
  "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
];

export function teamSizeByFormat(format) {
  const n = Number.parseInt(String(format || "5x5").split("x")[0], 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 5) : 5;
}

export function teamMaxMembersByFormat(format) {
  const size = teamSizeByFormat(format);
  if (size <= 1) return 1;
  return size + 1;
}

export function teamFormatByMembers(maxMembers) {
  const n = Number(maxMembers);
  if (!Number.isFinite(n) || n < 2) return "5x5";
  if (n <= 2) return "2x2";
  if (n <= 4) return "3x3";
  return "5x5";
}

export function isSoloFormat(format) {
  return String(format || "").toLowerCase() === "1x1";
}

export function normalizeCountryCode(code) {
  return String(code || "").trim().toUpperCase();
}

export function countryLabel(code) {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return "--";
  if (normalized === "EU") return "Europe";
  return normalized;
}

export function getCountryFlagUrl(code) {
  const normalized = normalizeCountryCode(code);
  if (normalized === "EU") return "/flags/eu.svg";
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  return `https://flagcdn.com/w40/${normalized.toLowerCase()}.png`;
}

export function buildTeamCountries() {
  const hasIntlRegionSupport =
    typeof Intl !== "undefined" &&
    typeof Intl.DisplayNames === "function" &&
    typeof Intl.supportedValuesOf === "function";

  let codes = TEAM_COUNTRY_FALLBACK_CODES;
  if (hasIntlRegionSupport) {
    try {
      codes = Intl.supportedValuesOf("region").filter((code) => /^[A-Z]{2}$/.test(code));
    } catch {
      codes = TEAM_COUNTRY_FALLBACK_CODES;
    }
  }

  const displayNames =
    typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
      ? new Intl.DisplayNames(["en"], { type: "region" })
      : null;

  const list = codes
    .map((code) => ({
      code,
      label: displayNames?.of(code) || code,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "en"));

  if (!list.some((c) => c.code === "EU")) {
    list.unshift({ code: "EU", label: "Europe" });
  }

  return list;
}
