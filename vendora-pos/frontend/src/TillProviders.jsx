import React from 'react';
import { Outlet } from 'react-router-dom';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { SettingsProvider } from './context/SettingsContext';
import { CartProvider } from './context/CartContext';
import { OfflineProvider } from './context/OfflineContext';
import { NotificationProvider } from './context/NotificationContext';

/**
 * Till-only context providers, scoped to the till/back-office routes via a pathless layout
 * route. The standalone PWA (front door + /home) renders OUTSIDE this, so it never mounts the
 * subscription/settings/cart/offline/notification providers (and never fires their on-mount API
 * calls). This is code-split (lazy) so none of it is in the PWA's initial dependency path.
 */
export default function TillProviders() {
  return (
    <SubscriptionProvider>
      <SettingsProvider>
        <CartProvider>
          <OfflineProvider>
            <NotificationProvider>
              <Outlet />
            </NotificationProvider>
          </OfflineProvider>
        </CartProvider>
      </SettingsProvider>
    </SubscriptionProvider>
  );
}
