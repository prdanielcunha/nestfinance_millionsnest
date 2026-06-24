import { useState, useCallback } from 'react';
import { transactionsService, TransactionsListResponse, TransactionDetailResponse } from '../../services/transactionsService.js';
import { useAuth } from '../useAuth.js';
import { useFinanceEntity } from '../../contexts/FinanceEntityContext.js';

export function useTransactions() {
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const organizationId = accessState?.organizationId;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listTransactions = useCallback(async (filters?: any, cursor?: string, pageSize?: number) => {
    if (!organizationId || !activeFinanceEntityId) throw new Error('Missing context');
    setLoading(true);
    setError(null);
    try {
      const data = await transactionsService.list(organizationId, activeFinanceEntityId, filters, cursor, pageSize);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [organizationId, activeFinanceEntityId]);

  const getTransactionDetail = useCallback(async (transactionId: string) => {
    if (!organizationId || !activeFinanceEntityId) throw new Error('Missing context');
    setLoading(true);
    setError(null);
    try {
      const data = await transactionsService.detail(organizationId, activeFinanceEntityId, transactionId);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [organizationId, activeFinanceEntityId]);

  const createDraft = useCallback(async (payload: any, idempotencyKey: string, requestId: string) => {
    if (!organizationId || !activeFinanceEntityId) throw new Error('Missing context');
    setLoading(true);
    setError(null);
    try {
      const data = await transactionsService.createDraft(organizationId, activeFinanceEntityId, payload, idempotencyKey, requestId);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [organizationId, activeFinanceEntityId]);

  const createAndSubmit = useCallback(async (payload: any, idempotencyKey: string, requestId: string) => {
    if (!organizationId || !activeFinanceEntityId) throw new Error('Missing context');
    setLoading(true);
    setError(null);
    try {
      const data = await transactionsService.createAndSubmit(organizationId, activeFinanceEntityId, payload, idempotencyKey, requestId);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [organizationId, activeFinanceEntityId]);

  const updateDraft = useCallback(async (transactionId: string, expectedVersion: number, payload: any, idempotencyKey: string, requestId: string) => {
    if (!organizationId || !activeFinanceEntityId) throw new Error('Missing context');
    setLoading(true);
    setError(null);
    try {
      const data = await transactionsService.updateDraft(organizationId, activeFinanceEntityId, transactionId, expectedVersion, payload, idempotencyKey, requestId);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [organizationId, activeFinanceEntityId]);

  const submitForReview = useCallback(async (transactionId: string, expectedVersion: number, idempotencyKey: string, requestId: string) => {
    if (!organizationId || !activeFinanceEntityId) throw new Error('Missing context');
    setLoading(true);
    setError(null);
    try {
      const data = await transactionsService.submitForReview(organizationId, activeFinanceEntityId, transactionId, expectedVersion, idempotencyKey, requestId);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [organizationId, activeFinanceEntityId]);

  const returnToDraft = useCallback(async (transactionId: string, expectedVersion: number, reasonCode: string, comment: string | undefined, idempotencyKey: string, requestId: string) => {
    if (!organizationId || !activeFinanceEntityId) throw new Error('Missing context');
    setLoading(true);
    setError(null);
    try {
      const data = await transactionsService.returnToDraft(organizationId, activeFinanceEntityId, transactionId, expectedVersion, reasonCode, comment, idempotencyKey, requestId);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [organizationId, activeFinanceEntityId]);

  const approveForPosting = useCallback(async (transactionId: string, expectedVersion: number, comment: string | undefined, approvalIdempotencyKey: string, requestId: string) => {
    if (!organizationId || !activeFinanceEntityId) throw new Error('Missing context');
    setLoading(true);
    setError(null);
    try {
      const data = await transactionsService.approveForPosting(organizationId, activeFinanceEntityId, transactionId, expectedVersion, comment, approvalIdempotencyKey, requestId);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [organizationId, activeFinanceEntityId]);

  const invalidateApproval = useCallback(async (transactionId: string, expectedVersion: number, expectedApprovalSourceHash: string, reasonCode: string, comment: string | undefined, idempotencyKey: string, requestId: string) => {
    if (!organizationId || !activeFinanceEntityId) throw new Error('Missing context');
    setLoading(true);
    setError(null);
    try {
      const data = await transactionsService.invalidateApproval(organizationId, activeFinanceEntityId, transactionId, expectedVersion, expectedApprovalSourceHash, reasonCode, comment, idempotencyKey, requestId);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [organizationId, activeFinanceEntityId]);

  const getPostingPlanPreview = useCallback(async (transactionId: string) => {
    if (!organizationId || !activeFinanceEntityId) throw new Error('Missing context');
    setLoading(true);
    setError(null);
    try {
      const data = await transactionsService.getPostingPlanPreview(organizationId, activeFinanceEntityId, transactionId);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [organizationId, activeFinanceEntityId]);

  return {
    loading,
    error,
    listTransactions,
    getTransactionDetail,
    createDraft,
    createAndSubmit,
    updateDraft,
    submitForReview,
    returnToDraft,
    approveForPosting,
    invalidateApproval,
    getPostingPlanPreview
  };
}
