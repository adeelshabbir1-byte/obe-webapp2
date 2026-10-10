/** Illustration for the sign-in screens: an outcome-attainment dashboard
 * (CLO → PLO mapping, attainment trend, accreditation readiness) drawn in the
 * app's own palette — brass maroon, sage, amber and parchment — for the deep
 * maroon sign-in panel. Pure SVG, so it renders on the server and costs no request. */
export default function AuthIllustration() {
  const font = { fontFamily: "var(--font-ui)" } as const;
  const display = { fontFamily: "var(--font-display)" } as const;
  return (
    <svg className="auth-art" viewBox="0 0 560 420" role="img" aria-label="Outcome attainment dashboard illustration" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ai-bar" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#7E2435" />
          <stop offset="1" stopColor="#C9808B" />
        </linearGradient>
        <linearGradient id="ai-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9A2D42" />
          <stop offset="1" stopColor="#5A1923" />
        </linearGradient>
        <filter id="ai-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#000000" floodOpacity=".35" />
        </filter>
      </defs>

      {/* main window */}
      <g filter="url(#ai-shadow)">
        <rect x="70" y="46" width="390" height="262" rx="20" fill="#FFFFFF" stroke="#E6DEDB" />
        <path d="M70 66a20 20 0 0 1 20-20h350a20 20 0 0 1 20 20v20H70z" fill="#F4EFEE" />
        <circle cx="94" cy="66" r="5" fill="#C0312B" />
        <circle cx="111" cy="66" r="5" fill="#C98A1B" />
        <circle cx="128" cy="66" r="5" fill="#1D8A4E" />
        <rect x="150" y="60" width="120" height="12" rx="6" fill="#E6DEDB" />

        {/* bars */}
        <line x1="96" y1="276" x2="300" y2="276" stroke="#E6DEDB" />
        {[
          [104, 214], [138, 196], [172, 204], [206, 170], [240, 150], [274, 122],
        ].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="22" height={276 - y} rx="6" fill="url(#ai-bar)" opacity={0.55 + i * 0.08} />
        ))}
        <path d="M100 200 C 150 190, 180 170, 214 150 S 262 120, 296 96" fill="none" stroke="#C98A1B" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M284 90 L300 94 L292 108" fill="none" stroke="#C98A1B" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="96" y="104" width="86" height="10" rx="5" fill="#D8C4C8" />
        <rect x="96" y="122" width="58" height="8" rx="4" fill="#EFE7E5" />

        {/* attainment ring */}
        <circle cx="384" cy="170" r="46" fill="none" stroke="#F4EFEE" strokeWidth="14" />
        <circle cx="384" cy="170" r="46" fill="none" stroke="url(#ai-ring)" strokeWidth="14" strokeLinecap="round"
          strokeDasharray="289" strokeDashoffset="52" transform="rotate(-90 384 170)" />
        <text x="384" y="176" textAnchor="middle" fill="#5A1923" fontSize="22" fontWeight="800" style={display}>82%</text>
        <text x="384" y="238" textAnchor="middle" fill="#574C50" fontSize="11" fontWeight="700" letterSpacing="1.5" style={font}>PLO ATTAINMENT</text>
        <rect x="336" y="256" width="96" height="8" rx="4" fill="#F4EFEE" />
        <rect x="336" y="256" width="70" height="8" rx="4" fill="#1D8A4E" />
      </g>

      {/* CLO → PLO mapping card */}
      <g filter="url(#ai-shadow)">
        <rect x="14" y="248" width="206" height="136" rx="16" fill="#FFFFFF" stroke="#E6DEDB" />
        <text x="32" y="276" fill="#241A1D" fontSize="12.5" fontWeight="800" style={display}>CLO → PLO mapping</text>
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(32 ${294 + i * 28})`}>
            <circle cx="8" cy="0" r="8" fill={["#1D8A4E", "#7E2435", "#2C578C"][i]} />
            <path d="M4.5 0 L7 2.5 L11.5 -2.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="24" y="-5" width={[92, 74, 104][i]} height="10" rx="5" fill="#EFE7E5" />
            <rect x="136" y="-8" width="34" height="16" rx="8" fill={["#E2F4E8", "#F8EEF0", "#E3EBF3"][i]} />
            <text x="153" y="4" textAnchor="middle" fontSize="9.5" fontWeight="800" fill={["#136B3A", "#5A1923", "#234A78"][i]} style={font}>
              {["PLO 1", "PLO 3", "PLO 7"][i]}
            </text>
          </g>
        ))}
      </g>

      {/* accreditation badge card */}
      <g filter="url(#ai-shadow)">
        <rect x="392" y="8" width="160" height="92" rx="16" fill="#FFFFFF" stroke="#E6DEDB" />
        <circle cx="422" cy="40" r="16" fill="#FBEED2" />
        <path d="M414 38 L422 33 L430 38 L422 43 Z" fill="#96650F" />
        <path d="M417 40 v5 c0 2 10 2 10 0 v-5" fill="none" stroke="#96650F" strokeWidth="2" />
        <text x="446" y="36" fill="#241A1D" fontSize="11.5" fontWeight="800" style={display}>NCEAC ready</text>
        <text x="446" y="51" fill="#897E82" fontSize="10" fontWeight="600" style={font}>Evidence complete</text>
        <rect x="408" y="70" width="128" height="8" rx="4" fill="#F4EFEE" />
        <rect x="408" y="70" width="112" height="8" rx="4" fill="#C98A1B" />
      </g>

      {/* graduation cap medallion */}
      <g filter="url(#ai-shadow)">
        <circle cx="500" cy="330" r="38" fill="#F7F4F3" />
        <path d="M478 326 L500 315 L522 326 L500 337 Z" fill="#7E2435" />
        <path d="M486 331 v9 c0 5 28 5 28 0 v-9" fill="none" stroke="#7E2435" strokeWidth="3" strokeLinejoin="round" />
        <path d="M518 327 v14" stroke="#7E2435" strokeWidth="2.5" strokeLinecap="round" />
      </g>

      {/* data pixels */}
      <rect x="28" y="96" width="16" height="16" rx="4" fill="#D8CFAE" />
      <rect x="10" y="126" width="11" height="11" rx="3" fill="#C9808B" />
      <rect x="34" y="146" width="12" height="12" rx="3" fill="#9A2D42" />
      <rect x="480" y="146" width="12" height="12" rx="3" fill="#D8CFAE" opacity=".85" />
      <rect x="504" y="172" width="9" height="9" rx="2" fill="#C9808B" />
    </svg>
  );
}
