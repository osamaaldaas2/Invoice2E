'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 3D isometric AI/brain processing icon
 */
export default function AI3DIcon() {
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
        filter: 'drop-shadow(0 10px 40px rgba(139, 92, 246, 0.2))',
        transform: isMobile ? 'none' : `translate(${mousePos.x}px, ${mousePos.y}px)`,
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      <defs>
        <linearGradient id="brainGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id="pulseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.6" />
        </linearGradient>
        <filter id="aiGlow">
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background glow */}
      <circle cx="150" cy="150" r="90" fill="#8b5cf6" opacity="0.15" />

      {/* Central processor cube - isometric */}
      <g transform="translate(150, 150)">
        {/* Front face */}
        <path
          d="M -35 0 L 0 -20 L 35 0 L 0 20 Z"
          fill="url(#brainGrad)"
          stroke="#a78bfa"
          strokeWidth="2"
          opacity="0.9"
        />

        {/* Top face */}
        <path d="M 0 -20 L 35 -40 L 70 -20 L 35 0 Z" fill="#c4b5fd" opacity="0.7" />

        {/* Right face */}
        <path d="M 35 0 L 70 -20 L 70 20 L 35 40 Z" fill="#8b5cf6" opacity="0.6" />

        {/* Circuit lines on front */}
        <path
          d="M -15 -5 L -5 -5 L -5 5 M 5 -5 L 15 -5 L 15 5"
          stroke="#c4b5fd"
          strokeWidth="2"
          fill="none"
          opacity="0.8"
        />

        {/* Pulsing core */}
        <circle cx="0" cy="0" r="8" fill="#c4b5fd" opacity="0.8">
          <animate attributeName="r" values="8;12;8" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;0.3;0.8" dur="2s" repeatCount="indefinite" />
        </circle>
      </g>

      {/* Neural network connections */}
      <g opacity="0.6" filter="url(#aiGlow)">
        {/* Top left node */}
        <circle cx="80" cy="80" r="6" fill="url(#pulseGrad)">
          <animate attributeName="opacity" values="0.6;1;0.6" dur="1.5s" repeatCount="indefinite" />
        </circle>
        <line
          x1="80"
          y1="80"
          x2="150"
          y2="130"
          stroke="#a78bfa"
          strokeWidth="2"
          strokeDasharray="5,5"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="10"
            dur="1s"
            repeatCount="indefinite"
          />
        </line>

        {/* Top right node */}
        <circle cx="220" cy="80" r="6" fill="url(#pulseGrad)">
          <animate attributeName="opacity" values="0.6;1;0.6" dur="1.8s" repeatCount="indefinite" />
        </circle>
        <line
          x1="220"
          y1="80"
          x2="185"
          y2="130"
          stroke="#a78bfa"
          strokeWidth="2"
          strokeDasharray="5,5"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="10"
            dur="1s"
            repeatCount="indefinite"
          />
        </line>

        {/* Bottom left node */}
        <circle cx="80" cy="220" r="6" fill="url(#pulseGrad)">
          <animate attributeName="opacity" values="0.6;1;0.6" dur="2.1s" repeatCount="indefinite" />
        </circle>
        <line
          x1="80"
          y1="220"
          x2="115"
          y2="170"
          stroke="#a78bfa"
          strokeWidth="2"
          strokeDasharray="5,5"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="10"
            dur="1s"
            repeatCount="indefinite"
          />
        </line>

        {/* Bottom right node */}
        <circle cx="220" cy="220" r="6" fill="url(#pulseGrad)">
          <animate attributeName="opacity" values="0.6;1;0.6" dur="1.6s" repeatCount="indefinite" />
        </circle>
        <line
          x1="220"
          y1="220"
          x2="185"
          y2="170"
          stroke="#a78bfa"
          strokeWidth="2"
          strokeDasharray="5,5"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="10"
            dur="1s"
            repeatCount="indefinite"
          />
        </line>
      </g>

      {/* Data flow particles */}
      <circle cx="0" cy="0" r="3" fill="#c4b5fd" opacity="0.8">
        <animateMotion dur="3s" repeatCount="indefinite" path="M 80 80 L 150 150" />
        <animate attributeName="opacity" values="0;0.8;0" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="0" cy="0" r="3" fill="#a78bfa" opacity="0.8">
        <animateMotion dur="3.5s" repeatCount="indefinite" path="M 220 80 L 185 150" />
        <animate attributeName="opacity" values="0;0.8;0" dur="3.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
