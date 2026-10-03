import React from 'react';
import { useNavigate } from 'react-router-dom';
import AccountView from '../components/account/AccountView';

// Thin route wrapper for the PWA owner account (login / create). Kept separate from the till's
// /login (Staff/PIN) per ADR-002.
export default function AccountPage() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto min-h-screen max-w-md px-4 py-8">
      <AccountView onDone={() => navigate('/home')} onBack={() => navigate('/home')} />
    </div>
  );
}
