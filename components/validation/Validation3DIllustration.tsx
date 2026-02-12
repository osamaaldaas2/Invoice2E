'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Lightweight 3D-style SVG illustration representing multi-layer validation.
 * Uses isometric perspective, gradients, and soft shadows for depth.
 * Optional parallax effect on desktop (mouse move).
 */
export default function Validation3DIllustration() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Parallax on desktop only
    if (!isMobile) {
      const handleMouseMove = (e: MouseEvent) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 20;
        const y = (e.clientY / window.innerHeight - 0.5) * 20;
        requestAnimationFrame(() => {
          setMousePos({ x, y });
        });
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
      viewBox="0 0 400 400"
      className="w-full h-auto max-w-md mx-auto"
      style={{
        filter: 'drop-shadow(0 10px 40px rgba(56, 189, 248, 0.15))',
        transform: isMobile ? 'none' : `translate(${mousePos.x}px, ${mousePos.y}px)`,
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      <defs>
        {/* Gradients for 3D depth */}
        <linearGradient id="layerGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="layerGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="layerGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.5" />
          <stop offset="100%" stopColor="# 38bdf8" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#059669" stopOpacity="0.5" />
        </linearGradient>
        <filter id="softShadow">
          <feGaussianBlur in="SourceAlpha" stdDeviation="4" />
          <feOffset dx="2" dy="4" result="offsetblur" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.3" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background glow */}
      <circle cx="200" cy="200" r="150" fill="url(#layerGrad1)" opacity="0.2" />

      {/* Layer 3 (back) - Isometric panel */}
      <g filter="url(#softShadow)">
        <path
          d="M 120 180 L 280 180 L 300 160 L 140 160 Z"
          fill="url(#layerGrad1)"
          stroke="#0ea5e9"
          strokeWidth="1.5"
          opacity="0.6"
        />
        <path
          d="M 280 180 L 300 160 L 300 240 L 280 260 Z"
          fill="url(#layerGrad1)"
          stroke="#0ea5e9"
          strokeWidth="1.5"
          opacity="0.4"
        />
        <path
          d="M 120 180 L 140 160 L 140 240 L 120 260 Z"
          fill="url(#layerGrad1)"
          stroke="#0ea5e9"
          strokeWidth="1.5"
          opacity="0.5"
        />
        <path
          d="M 120 180 L 280 180 L 280 260 L 120 260 Z"
          fill="url(#layerGrad1)"
          stroke="#0ea5e9"
          strokeWidth="1.5"
          opacity="0.7"
        />
      </g>

      {/* Layer 2 (middle) */}
      <g filter="url(#softShadow)">
        <path
          d="M 100 140 L 260 140 L 280 120 L 120 120 Z"
          fill="url(#layerGrad2)"
          stroke="#38bdf8"
          strokeWidth="1.5"
          opacity="0.7"
        />
        <path
          d="M 260 140 L 280 120 L 280 200 L 260 220 Z"
          fill="url(#layerGrad2)"
          stroke="#38bdf8"
          strokeWidth="1.5"
          opacity="0.5"
        />
        <path
          d="M 100 140 L 120 120 L 120 200 L 100 220 Z"
          fill="url(#layerGrad2)"
          stroke="#38bdf8"
          strokeWidth="1.5"
          opacity="0.6"
        />
        <path
          d="M 100 140 L 260 140 L 260 220 L 100 220 Z"
          fill="url(#layerGrad2)"
          stroke="#38bdf8"
          strokeWidth="1.5"
          opacity="0.8"
        />
      </g>

      {/* Layer 1 (front) */}
      <g filter="url(#softShadow)">
        <path
          d="M 80 100 L 240 100 L 260 80 L 100 80 Z"
          fill="url(#layerGrad3)"
          stroke="#7dd3fc"
          strokeWidth="2"
          opacity="0.8"
        />
        <path
          d="M 240 100 L 260 80 L 260 160 L 240 180 Z"
          fill="url(#layerGrad3)"
          stroke="#7dd3fc"
          strokeWidth="2"
          opacity="0.6"
        />
        <path
          d="M 80 100 L 100 80 L 100 160 L 80 180 Z"
          fill="url(#layerGrad3)"
          stroke="#7dd3fc"
          strokeWidth="2"
          opacity="0.7"
        />
        <path
          d="M 80 100 L 240 100 L 240 180 L 80 180 Z"
          fill="url(#layerGrad3)"
          stroke="#7dd3fc"
          strokeWidth="2"
          opacity="0.9"
        />
      </g>

      {/* Shield/check mark (validation symbol) */}
      <g transform="translate(280, 200)">
        <path
          d="M 0 0 L 25 -10 L 50 0 L 50 30 Q 50 50 25 60 Q 0 50 0 30 Z"
          fill="url(#shieldGrad)"
          stroke="#10b981"
          strokeWidth="2"
          filter="url(#softShadow)"
        />
        <path
          d="M 15 25 L 22 32 L 37 15"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* Pipeline flow line */}
      <path
        d="M 50 300 Q 100 280, 150 300 T 250 300 L 300 300"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="2"
        strokeDasharray="5,5"
        opacity="0.5"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to="10"
          dur="1s"
          repeatCount="indefinite"
        />
      </path>

      {/* Data dots flowing */}
      <circle cx="0" cy="300" r="3" fill="#7dd3fc">
        <animateMotion
          dur="3s"
          repeatCount="indefinite"
          path="M 50 300 Q 100 280, 150 300 T 250 300 L 350 300"
        />
      </circle>
    </svg>
  );
}
