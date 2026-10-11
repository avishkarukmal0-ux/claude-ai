import React from 'react';
import { Navigate } from 'react-router-dom';
import { ACCOUNTS_ENABLED, useSession } from '../../lib/account';

// Isolation starts at login. The PWA shop app (and its data) must not be reachable until a shop signs in, so
// one shop can never browse another's data by simply opening the app without logging in. This guard sits in
// front of the app screens and sends a signed-out visitor to the account screen (which offers log in AND
// create account) until they authenticate; on sign-in the workspace is switched to that shop's own data.
//
// Safety: the gate only applies when accounts are ENABLED (there is an auth backend to log into). With
// accounts disabled there is no login to require AND only a single local workspace exists (no other account's
// data to expose), so the app stays open rather than locking everyone out. `enabled` is injectable for tests.
export default function RequireShopLogin({ children, enabled = ACCOUNTS_ENABLED }) {
  const { loggedIn } = useSession();
  if (enabled && !loggedIn) return <Navigate to="/account" replace />;
  return children;
}
