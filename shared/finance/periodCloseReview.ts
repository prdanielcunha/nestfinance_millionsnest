export type PeriodCloseReviewConfirmResponse = {
  reviewId: string;
  financeEntityId: string;
  periodKey: string;
  reviewedAt: string;
  reviewedByDisplayName: string;
  replayed: boolean;
  currentSnapshot: true;
  authority: {
    financialMutation: false;
    closeMutation: false;
    periodClosed: false;
    officialReport: false;
  };
};
