const DEFAULT_CONTACT_URL =
  "https://github.com/tuliosoria/pokemon-investing/issues";

export interface LegalConfig {
  operatorName: string;
  contactEmail: string | null;
  privacyEmail: string | null;
  businessAddress: string | null;
  contactUrl: string;
}

function normalize(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getLegalConfig(): LegalConfig {
  const contactEmail = normalize(process.env.LEGAL_CONTACT_EMAIL);
  const privacyEmail =
    normalize(process.env.PRIVACY_REQUEST_EMAIL) ?? contactEmail;

  return {
    operatorName: normalize(process.env.LEGAL_OPERATOR_NAME) ?? "PokeFuture",
    contactEmail,
    privacyEmail,
    businessAddress: normalize(process.env.LEGAL_BUSINESS_ADDRESS),
    contactUrl: normalize(process.env.LEGAL_CONTACT_URL) ?? DEFAULT_CONTACT_URL,
  };
}
