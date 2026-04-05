import { useAuth } from './useAuth';
export function useFeatureFlags() {
  const { user } = useAuth();
  return {
    loyaltyEnabled: true,
    giftCardsEnabled: true,
    trainingModeEnabled: true,
  };
}
