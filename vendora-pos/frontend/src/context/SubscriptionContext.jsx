import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';
import { useSocket } from '../hooks/useSocket';
import toast from 'react-hot-toast';

const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ children }) {
  const { user, storeId } = useAuth();
  const { on } = useSocket(storeId);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.get('/subscriptions/current');
      setSubscription(data.subscription || data);
    } catch {
      // Set a default trial subscription if API fails
      setSubscription({
        plan: 'trial',
        status: 'trial',
        features: {
          maxTills: 1,
          maxStaff: 5,
          maxProducts: 1000,
          maxStores: 1,
          maxWholesalers: 33,
          lossPrevention: true,
          loyaltyGiftCards: true,
          smartReorder: true,
          mobileApp: true,
          clickCollect: true,
          selfCheckout: true,
          xeroSync: false,
          quickbooksSync: false,
          scheduledReports: false,
          apiAccess: false,
          multiStore: false,
          customReports: true,
          prioritySupport: false,
          staffScheduling: true,
        },
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Real-time unlock via Socket.io
  useEffect(() => {
    return on('subscription:upgraded', (data) => {
      setSubscription((prev) => ({ ...prev, ...data, features: data.features }));
      toast.success('🎉 Upgrade successful! Features unlocked.', { duration: 6000 });
    });
  }, [on]);

  const hasFeature = useCallback(
    (featureName) => {
      if (!subscription) return true; // assume trial = all features
      const val = subscription.features?.[featureName];
      if (typeof val === 'boolean') return val;
      if (typeof val === 'number') return val > 0;
      return true;
    },
    [subscription]
  );

  const trialDaysLeft =
    subscription?.trialDaysLeft ??
    (subscription?.trialEndsAt
      ? Math.max(
          0,
          Math.ceil((new Date(subscription.trialEndsAt) - Date.now()) / 86400000)
        )
      : null);

  const isTrialExpired =
    subscription?.status === 'trial' &&
    trialDaysLeft !== null &&
    trialDaysLeft <= 0;

  return (
    <SubscriptionContext.Provider
      value={{ subscription, loading, refresh, hasFeature, trialDaysLeft, isTrialExpired }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export const useSubscription = () => useContext(SubscriptionContext);
