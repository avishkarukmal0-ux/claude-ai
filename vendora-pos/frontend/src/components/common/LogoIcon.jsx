const LogoIcon = ({ size = 32 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: 'block', flexShrink: 0 }}
  >
    <rect width="48" height="48" rx="11" fill="#2563EB" />
    <path d="M13 15 L24 35 L35 15" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="24" cy="15" r="4.5" fill="white" />
  </svg>
);

export default LogoIcon;
