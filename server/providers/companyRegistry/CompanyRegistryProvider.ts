export interface CompanyRegistryLookupResult {
  provider: 'brasilapi' | 'manual';
  providerDataset: 'minha_receita' | null;
  taxId: string;
  legalName: string;
  tradeName: string | null;
  registrationStatus: string | null;
  registrationStatusDate: string | null;
  openingDate: string | null;
  legalNatureCode: string | null;
  legalNatureDescription: string | null;
  primaryActivityCode: string | null;
  primaryActivityDescription: string | null;
  registeredAddress: {
    postalCode: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
  };
}

export interface CompanyRegistryProvider {
  readonly id: string;
  lookupCnpj(
    normalizedTaxId: string,
    signal: AbortSignal
  ): Promise<CompanyRegistryLookupResult>;
}
