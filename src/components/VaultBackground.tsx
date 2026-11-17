import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  baseRadius: number;
  baseAlpha: number;
  color: string;
}

interface VaultBackgroundProps {
  status?: 'idle' | 'locked' | 'unlocking' | 'unlocked' | 'error';
}

export const VaultBackground: React.FC<VaultBackgroundProps> = ({ status = 'idle' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = window.innerWidth < 768;

    // Track mouse for subtle parallax
    let mouseX = width / 2;
    let mouseY = height / 2;
    let targetParallaxX = 0;
    let targetParallaxY = 0;
    let currentParallaxX = 0;
    let currentParallaxY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      targetParallaxX = (e.clientX / width - 0.5) * 2;
      targetParallaxY = (e.clientY / height - 0.5) * 2;
    };

    if (!isMobile && !prefersReducedMotion) {
      window.addEventListener('mousemove', handleMouseMove, { passive: true });
    }

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Particle setup
    const particleCount = isMobile ? 18 : 38;
    const particles: Particle[] = [];

    const colors = [
      'rgba(88, 217, 255, ',  // Cyan
      'rgba(44, 220, 230, ',  // Teal
      'rgba(225, 240, 245, ', // Cool Steel White
      'rgba(148, 163, 184, ', // Slate Metallic
    ];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        z: Math.random() * 0.8 + 0.2, // depth factor 0.2 .. 1.0
        vx: (Math.random() - 0.5) * 0.25,
        vy: -Math.random() * 0.35 - 0.08, // gentle upward drift
        baseRadius: Math.random() * 1.5 + 0.6,
        baseAlpha: Math.random() * 0.35 + 0.15,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      ctx.clearRect(0, 0, width, height);

      // Smooth parallax damping
      currentParallaxX += (targetParallaxX - currentParallaxX) * 0.04;
      currentParallaxY += (targetParallaxY - currentParallaxY) * 0.04;

      if (containerRef.current) {
        containerRef.current.style.setProperty('--bg-parallax-x', `${currentParallaxX * 12}px`);
        containerRef.current.style.setProperty('--bg-parallax-y', `${currentParallaxY * 8}px`);
      }

      // Draw particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (!prefersReducedMotion) {
          p.x += p.vx + currentParallaxX * p.z * 0.4;
          p.y += p.vy + currentParallaxY * p.z * 0.25;

          // Wrap edges
          if (p.x < -20) p.x = width + 20;
          if (p.x > width + 20) p.x = -20;
          if (p.y < -20) p.y = height + 20;
          if (p.y > height + 20) p.y = -20;
        }

        const size = p.baseRadius * (p.z * 0.8 + 0.6);
        const alpha = p.baseAlpha * p.z;

        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${alpha})`;
        ctx.fill();

        // Soft halo on closest particles
        if (p.z > 0.75) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `${p.color}${alpha * 0.2})`;
          ctx.fill();
        }
      }

      if (!prefersReducedMotion) {
        animFrameId = requestAnimationFrame(render);
      }
    };

    if (prefersReducedMotion) {
      render(performance.now());
    } else {
      animFrameId = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const isUnlocked = status === 'unlocked';
  const isError = status === 'error';

  return (
    <div
      ref={containerRef}
      className={`aman-vault-bg-root ${isUnlocked ? 'aman-vault-bg-root--unlocked' : ''} ${
        isError ? 'aman-vault-bg-root--error' : ''
      }`}
      aria-hidden="true"
    >
      {/* 1. Deep Layered Metallic Studio Base */}
      <div className="aman-vault-bg-base" />

      {/* 2. Precision Security Dot/Grid Pattern */}
      <div className="aman-vault-bg-grid" />

      {/* 3. Subtle Cyber Radial Aura behind Central Vault */}
      <div className="aman-vault-bg-core-aura" />

      {/* 4. Directional Light Beam / Studio Ambient Sweep */}
      <div className="aman-vault-bg-beam" />

      {/* 5. Live Interactive Particles Canvas */}
      <canvas ref={canvasRef} className="aman-vault-bg-canvas" />

      {/* 6. Cinematic Vignette & Edge Inset Shadow */}
      <div className="aman-vault-bg-vignette" />
    </div>
  );
};
