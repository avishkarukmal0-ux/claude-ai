const Logo = ({ width = 148, variant = 'dark' }) => {
  const textColor = variant === 'dark' ? 'white' : '#0F172A';
  const subColor  = variant === 'dark' ? 'rgba(255,255,255,0.4)' : '#94A3B8';
  return (
    <svg
      width={width}
      height={Math.round(width * 0.23)}
      viewBox="0 0 220 52"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect x="0" y="2" width="48" height="48" rx="11" fill="#2563EB" />
      <path d="M13 17 L24 37 L35 17" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="17" r="4" fill="white" />
      <text x="62" y="24" fontFamily="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" fontSize="20" fontWeight="600" fill={textColor} letterSpacing="-0.5">Vendora</text>
      <text x="63" y="42" fontFamily="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" fontSize="12" fontWeight="400" fill={subColor} letterSpacing="2">POS</text>
    </svg>
  );
};

export default Logo;
