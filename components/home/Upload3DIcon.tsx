'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 3D isometric upload/document icon for upload section
 */
export default function Upload3DIcon() {
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
        filter: 'drop-shadow(0 10px 40px rgba(56, 189, 248, 0.2))',
        transform: isMobile ? 'none' : `translate(${mousePos.x}px, ${mousePos.y}px)`,
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      <defs>
        <linearGradient id="docGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id="arrowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.6" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background glow */}
      <circle cx="150" cy="150" r="80" fill="#38bdf8" opacity="0.1" />

      {/* Document - isometric */}
      <g transform="translate(150, 180)">
        {/* Back face */}
        <path
          d="M -40 -60 L 40 -60 L 40 40 L -40 40 Z"
          fill="url(#docGrad)"
          stroke="#38bdf8"
          strokeWidth="2"
          opacity="0.9"
        />

        {/* Folded corner */}
        <path d="M 30 -60 L 30 -50 L 40 -50 Z" fill="#0ea5e9" opacity="0.6" />

        {/* Lines on document */}
        <line x1="-25" y1="-40" x2="20" y2="-40" stroke="#7dd3fc" strokeWidth="2" opacity="0.4" />
        <line x1="-25" y1="-25" x2="25" y2="-25" stroke="#7dd3fc" strokeWidth="2" opacity="0.4" />
        <line x1="-25" y1="-10" x2="15" y2="-10" stroke="#7dd3fc" strokeWidth="2" opacity="0.4" />

        {/* Top face */}
        <path d="M -40 -60 L -20 -70 L 60 -70 L 40 -60 Z" fill="#0ea5e9" opacity="0.5" />

        {/* Right face */}
        <path d="M 40 -60 L 60 -70 L 60 30 L 40 40 Z" fill="#0284c7" opacity="0.4" />
      </g>

      {/* Upload arrow */}
      <g transform="translate(150, 100)" filter="url(#glow)">
        <path
          d="M -15 20 L 0 5 L 15 20"
          fill="none"
          stroke="url(#arrowGrad)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0,0; 0,-5; 0,0"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </path>
        <line
          x1="0"
          y1="5"
          x2="0"
          y2="35"
          stroke="url(#arrowGrad)"
          strokeWidth="6"
          strokeLinecap="round"
        >
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0,0; 0,-5; 0,0"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </line>
      </g>

      {/* Floating particles */}
      <circle cx="80" cy="120" r="3" fill="#7dd3fc" opacity="0.6">
        <animate attributeName="cy" values="120;100;120" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="220" cy="100" r="2" fill="#38bdf8" opacity="0.5">
        <animate attributeName="cy" values="100;80;100" dur="2.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="190" cy="200" r="2.5" fill="#7dd3fc" opacity="0.4">
        <animate attributeName="cy" values="200;180;200" dur="2.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
