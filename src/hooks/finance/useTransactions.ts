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

  const submitForReview = useCallback(async (transactionId: string, expectedVersion: number) => {
    if (!organizationId || !activeFinanceEntityId) throw new Error('Missing context');
    setLoading(true);
    setError(null);
    try {
      const data = await transactionsService.submitForReview(organizationId, activeFinanceEntityId, transactionId, expectedVersion);
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
    updateDraft,
    submitForReview
  };
}
