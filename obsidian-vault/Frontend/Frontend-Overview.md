# Frontend Overview

Back to [[Home]] · Related: [[Architecture]] · [[Routing-and-Pages]] · [[State-and-Contexts]]

Location: `vendora-pos/frontend/` — React 18 + Vite 5 SPA.

## Entry chain
```
index.html → src/main.jsx → src/App.jsx
```

## Provider stack (`App.jsx`)
Nested context providers wrap the whole app (outer → inner):
```
AuthProvider
  └─ SubscriptionProvider
       └─ SettingsProvider
            └─ CartProvider
                 └─ OfflineProvider
                      └─ NotificationProvider
                           └─ <Routes>
```
See [[State-and-Contexts]] for what each holds.

## Shell
- `components/Layout.jsx` — authenticated shell (sidebar + outlet)
- `components/Sidebar.jsx` — navigation
- `components/ErrorBoundary.jsx` — crash guard
- `pages/LoginPage.jsx` — unauthenticated entry

## Route protection
`ProtectedRoute` in `App.jsx` checks `user` + optional `requiredRole` (staff/supervisor/manager). Unauthed → `/login`; under-privileged → `/`. See [[Routing-and-Pages]].

## Folder map
| Folder | Purpose | Note |
|---|---|---|
| `src/pages/` | route screens (40+) | [[Routing-and-Pages]] |
| `src/components/` | reusable UI | below |
| `src/context/` | global state | [[State-and-Contexts]] |
| `src/hooks/` | reusable logic | [[State-and-Contexts]] |
| `src/services/` | axios API wrappers | [[State-and-Contexts]] |
| `src/styles/` | design tokens CSS | |
| `src/assets/` | logos/SVGs | |

## Shared components
- `common/NumericKeyboard.jsx` — mobile numeric entry (used in payroll) ⭐
- `common/LockedFeature.jsx` — subscription gate UI
- `common/Logo.jsx`, `common/LogoIcon.jsx`
- `payroll/EditEmployeeModal.jsx` — payroll line editor ⭐
- `pos/POSLockScreen.jsx`
- `QuickSellGrid.jsx`, `StaffLeaderboard.jsx`, `TapToPayModal.jsx`, `CameraExpiryScanner.jsx`

## Styling
Tailwind CSS 3 utility classes inline, `design-tokens.css` for variables, lucide-react icons. Currency via `fmt()`. See [[Conventions]].
