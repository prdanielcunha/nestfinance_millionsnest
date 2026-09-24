import { getAuth } from 'firebase/auth';
import { FINANCE_GATEWAY_PATH } from '../config/api';
import type {
  AccountantPackageFile,
  AccountantPackageLayout,
} from '../../shared/finance/accountantPackage';

async function headers(organizationId: string) {
  const result = new Headers({
    'Content-Type': 'application/json',
    'x-organization-id': organizationId,
  });
  const user = getAuth().currentUser;
  if (user) result.set('Authorization', `Bearer ${await user.getIdToken()}`);
  return result;
}

export type AccountantPackageResponse = {
  period: string;
  layout: AccountantPackageLayout;
  files: AccountantPackageFile[];
  manifest: Record<string, unknown>;
  financialMutation: false;
  postingCertificationSeparate: true;
};

export const accountantPackageService = {
  async generate(
    organizationId: string,
    financeEntityId: string,
    period: string,
    layout?: Partial<AccountantPackageLayout>,
  ): Promise<AccountantPackageResponse> {
    const response = await fetch(
      `${FINANCE_GATEWAY_PATH}?operation=accountant-package-export`,
      {
        method: 'POST',
        headers: await headers(organizationId),
        body: JSON.stringify({ financeEntityId, period, layout }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error: any = new Error(body.error || 'ACCOUNTANT_PACKAGE_EXPORT_FAILED');
      error.code = body.error;
      error.status = response.status;
      throw error;
    }
    return body as AccountantPackageResponse;
  },
};

export function downloadAccountantPackageFile(file: AccountantPackageFile) {
  const blob = new Blob([file.content], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
