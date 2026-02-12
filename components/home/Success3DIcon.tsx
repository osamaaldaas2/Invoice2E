'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 3D isometric success/checkmark icon
 */
export default function Success3DIcon() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);

    if (!isMobile) {
      const handleMouseMove = (e: MouseEvent) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 10;
        const y = (e.clientY / window.innerHeight - 0.5) * 10;
        requestAnimationFrame(() => setMousePos({ x, y }));
      };
      window.addEventListener('mousemove', handleMouseMove);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('resize', checkMobile);
      };
    }

    return () => window.removeEventListener('resize', checkMobile);
  }, [isMobile]);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 300 300"
      className="w-full h-auto max-w-xs mx-auto"
      style={{
        filter: 'drop-shadow(0 10px 40px rgba(16, 185, 129, 0.2))',
        transform: isMobile ? 'none' : `translate(${mousePos.x}px, ${mousePos.y}px)`,
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      <defs>
        <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="ribbonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6ee7b7" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0.5" />
        </linearGradient>
        <filter id="successGlow">
          <feGaussianBlur stdDeviation="5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background glow */}
      <circle cx="150" cy="150" r="100" fill="#10b981" opacity="0.12" />

      {/* Badge/Medal - isometric */}
      <g transform="translate(150, 160)">
        {/* Front circle */}
        <circle
          cx="0"
          cy="0"
          r="50"
          fill="url(#badgeGrad)"
          stroke="#34d399"
          strokeWidth="3"
          opacity="0.95"
        />

        {/* Inner ring */}
        <circle cx="0" cy="0" r="40" fill="none" stroke="#6ee7b7" strokeWidth="2" opacity="0.6" />

        {/* Checkmark */}
        <path
          d="M -18 0 L -8 12 L 20 -15"
          fill="none"
          stroke="#ffffff"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#successGlow)"
        >
          <animate
            attributeName="stroke-dasharray"
            from="0 100"
            to="100 0"
            dur="1s"
            fill="freeze"
          />
        </path>

        {/* Top ribbon - left */}
        <path d="M -15 -48 L -25 -70 L -15 -75 L -10 -50 Z" fill="url(#ribbonGrad)" opacity="0.8" />

        {/* Top ribbon - right */}
        <path d="M 15 -48 L 25 -70 L 15 -75 L 10 -50 Z" fill="url(#ribbonGrad)" opacity="0.7" />

        {/* Shadow/depth */}
        <ellipse cx="3" cy="3" rx="50" ry="50" fill="#059669" opacity="0.2" />
      </g>

      {/* Sparkles */}
      <g opacity="0.8">
        <path d="M 80 100 L 85 105 L 80 110 L 75 105 Z" fill="#6ee7b7">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 80 105"
            to="360 80 105"
            dur="4s"
            repeatCount="indefinite"
          />
          <animate attributeName="opacity" values="0.8;0.3;0.8" dur="2s" repeatCount="indefinite" />
        </path>

        <path d="M 220 120 L 224 124 L 220 128 L 216 124 Z" fill="#34d399">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 220 124"
            to="360 220 124"
            dur="3s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.6;0.9;0.6"
            dur="1.8s"
            repeatCount="indefinite"
          />
        </path>

        <path d="M 200 200 L 205 205 L 200 210 L 195 205 Z" fill="#6ee7b7">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 200 205"
            to="360 200 205"
            dur="3.5s"
            repeatCount="indefinite"
          />
          <animate attributeName="opacity" values="0.5;1;0.5" dur="2.2s" repeatCount="indefinite" />
        </path>
      </g>

      {/* Success ring pulse */}
      <circle cx="150" cy="160" r="55" fill="none" stroke="#34d399" strokeWidth="2" opacity="0">
        <animate attributeName="r" values="55;70;85" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;0.2;0" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
