import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Invoice2E – AI-Powered Invoice Conversion';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    <div
      style={{
        background: 'linear-gradient(135deg, #0a0f1c 0%, #111827 50%, #0a0f1c 100%)',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'sans-serif',
        position: 'relative',
      }}
    >
      {/* Glow effect */}
      <div
        style={{
          position: 'absolute',
          top: '-100px',
          left: '200px',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'rgba(56, 189, 248, 0.15)',
          filter: 'blur(100px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-50px',
          right: '200px',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          background: 'rgba(99, 102, 241, 0.12)',
          filter: 'blur(80px)',
        }}
      />

      {/* Logo / Brand */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <span style={{ fontSize: '64px', marginRight: '16px' }}>⚡</span>
        <span
          style={{
            fontSize: '72px',
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-2px',
          }}
        >
          Invoice2E
        </span>
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: '32px',
          color: '#94a3b8',
          textAlign: 'center',
          maxWidth: '800px',
          lineHeight: 1.4,
        }}
      >
        Convert PDF Invoices to XRechnung,
        <br />
        ZUGFeRD & E-Invoice Formats with AI
      </div>

      {/* Bottom bar */}
      <div
        style={{
          position: 'absolute',
          bottom: '40px',
          display: 'flex',
          alignItems: 'center',
          gap: '32px',
        }}
      >
        <span style={{ fontSize: '20px', color: '#64748b' }}>invoice2e.eu</span>
        <span style={{ fontSize: '20px', color: '#334155' }}>•</span>
        <span style={{ fontSize: '20px', color: '#64748b' }}>🇩🇪 Made in Germany</span>
        <span style={{ fontSize: '20px', color: '#334155' }}>•</span>
        <span style={{ fontSize: '20px', color: '#64748b' }}>DSGVO-compliant</span>
      </div>
    </div>,
    { ...size }
  );
}
