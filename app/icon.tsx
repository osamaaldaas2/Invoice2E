import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 6,
        background: 'linear-gradient(135deg, #0f172a, #1e293b)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
        <path d="M12 0L0 14h8l-2 10L18 10h-8l2-10z" fill="url(#bolt)" />
        <defs>
          <linearGradient id="bolt" x1="0" y1="0" x2="18" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38bdf8" />
            <stop offset="1" stopColor="#818cf8" />
          </linearGradient>
        </defs>
      </svg>
    </div>,
    { ...size }
  );
}
