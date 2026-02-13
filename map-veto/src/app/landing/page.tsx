'use client';

import { useEffect, useState } from 'react';

const services = [
  {
    id: 'mapveto',
    title: 'Map Veto',
    description: 'Real-time map veto system for VALORANT tournament matches.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
        <line x1="12" y1="22" x2="12" y2="15.5" />
        <polyline points="22 8.5 12 15.5 2 8.5" />
        <polyline points="2 15.5 12 8.5 22 15.5" />
        <line x1="12" y1="2" x2="12" y2="8.5" />
      </svg>
    ),
    href: 'https://mapveto.emeaclash.com',
    gradient: 'from-violet-600 to-purple-600',
    glowColor: 'rgba(139, 92, 246, 0.4)',
    borderColor: 'rgba(139, 92, 246, 0.3)',
    available: true,
  },
  {
    id: 'graphics',
    title: 'Live Graphics',
    description: 'Broadcast-ready graphics and overlays for live streams.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    href: '#',
    gradient: 'from-cyan-600 to-teal-600',
    glowColor: 'rgba(6, 182, 212, 0.4)',
    borderColor: 'rgba(6, 182, 212, 0.3)',
    available: false,
  },
  {
    id: 'timer',
    title: 'OnSync Timer',
    description: 'Synchronized countdown timers for tournament scheduling.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    href: 'https://onsync.emeaclash.com',
    gradient: 'from-amber-600 to-orange-600',
    glowColor: 'rgba(245, 158, 11, 0.4)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    available: true,
  },
];

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <style>{`
        .landing-bg {
          background: #0a0a0f;
          position: relative;
          overflow: hidden;
        }

        .landing-bg::before {
          content: '';
          position: fixed;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: 
            radial-gradient(ellipse at 20% 50%, rgba(139, 92, 246, 0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 50%, rgba(236, 72, 153, 0.06) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 0%, rgba(6, 182, 212, 0.05) 0%, transparent 50%);
          animation: bg-shift 20s ease-in-out infinite alternate;
          pointer-events: none;
          z-index: 0;
        }

        @keyframes bg-shift {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(-5%, 3%) rotate(3deg); }
        }

        .grid-overlay {
          position: fixed;
          inset: 0;
          background-image: 
            linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
          background-size: 60px 60px;
          pointer-events: none;
          z-index: 0;
        }

        .service-card {
          position: relative;
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 1.5rem;
          padding: 2.5rem;
          transition: all 0.5s cubic-bezier(0.22, 1, 0.36, 1);
          cursor: pointer;
          overflow: hidden;
          text-decoration: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 1.25rem;
        }

        .service-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 1.5rem;
          opacity: 0;
          transition: opacity 0.5s ease;
          z-index: 0;
        }

        .service-card:hover {
          transform: translateY(-8px) scale(1.02);
          border-color: var(--card-border-color);
        }

        .service-card:hover::before {
          opacity: 1;
        }

        .service-card.available:hover {
          box-shadow: 0 20px 60px -10px var(--card-glow-color);
        }

        .service-card.unavailable {
          cursor: default;
          opacity: 0.5;
        }

        .service-card .icon-wrapper {
          width: 72px;
          height: 72px;
          border-radius: 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 1;
          transition: all 0.5s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .service-card:hover .icon-wrapper {
          transform: scale(1.1);
        }

        .service-card .card-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: white;
          position: relative;
          z-index: 1;
          letter-spacing: -0.02em;
        }

        .service-card .card-desc {
          font-size: 0.95rem;
          color: rgba(255, 255, 255, 0.45);
          line-height: 1.6;
          position: relative;
          z-index: 1;
          max-width: 280px;
        }

        .service-card .card-action {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          font-weight: 600;
          padding: 0.625rem 1.5rem;
          border-radius: 9999px;
          position: relative;
          z-index: 1;
          transition: all 0.3s ease;
          margin-top: 0.5rem;
        }

        .service-card .card-action.active {
          color: white;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .service-card:hover .card-action.active {
          background: rgba(255, 255, 255, 0.12);
          gap: 0.75rem;
        }

        .service-card .card-action.disabled {
          color: rgba(255, 255, 255, 0.3);
        }

        .coming-soon-badge {
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          padding: 0.35rem 0.85rem;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.08);
          position: relative;
          z-index: 1;
        }

        .logo-glow {
          filter: drop-shadow(0 0 30px rgba(196, 255, 0, 0.3));
          transition: filter 0.5s ease;
        }

        .logo-glow:hover {
          filter: drop-shadow(0 0 50px rgba(196, 255, 0, 0.5));
        }

        .fade-in {
          opacity: 0;
          transform: translateY(20px);
          animation: fadeInUp 0.8s ease forwards;
        }

        .fade-in-delay-1 { animation-delay: 0.15s; }
        .fade-in-delay-2 { animation-delay: 0.3s; }
        .fade-in-delay-3 { animation-delay: 0.45s; }
        .fade-in-delay-4 { animation-delay: 0.6s; }

        @keyframes fadeInUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .divider-line {
          width: 60px;
          height: 3px;
          border-radius: 2px;
          background: linear-gradient(90deg, #8b5cf6, #ec4899);
        }

        @media (max-width: 768px) {
          .service-card {
            padding: 2rem 1.5rem;
          }
          .service-card .card-title {
            font-size: 1.25rem;
          }
        }
      `}</style>

      <div className="landing-bg min-h-screen flex flex-col items-center justify-center px-6 py-16">
        <div className="grid-overlay" />

        <div className="relative z-10 flex flex-col items-center w-full max-w-5xl">
          {/* Logo & Header */}
          <div className={`flex flex-col items-center mb-16 ${mounted ? 'fade-in' : 'opacity-0'}`}>
            <img
              src="/429px-VALORANT_EMEA_Clash_allmode.png"
              alt="EMEA Clash"
              className="logo-glow h-28 md:h-36 mb-6"
              draggable={false}
            />
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-3">
              EMEA <span style={{ color: '#c4ff00' }}>Clash</span>
            </h1>
            <div className="divider-line mb-4" />
            <p className="text-white/40 text-lg text-center max-w-md">
              Tournament tools &amp; services platform
            </p>
          </div>

          {/* Service Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            {services.map((service, index) => {
              const CardTag = service.available ? 'a' : 'div';
              return (
                <CardTag
                  key={service.id}
                  href={service.available ? service.href : undefined}
                  className={`service-card ${service.available ? 'available' : 'unavailable'} ${mounted ? `fade-in fade-in-delay-${index + 2}` : 'opacity-0'
                    }`}
                  style={{
                    '--card-glow-color': service.glowColor,
                    '--card-border-color': service.borderColor,
                  } as React.CSSProperties}
                >
                  <div
                    className="icon-wrapper"
                    style={{
                      background: `linear-gradient(135deg, ${service.glowColor}, transparent)`,
                      border: `1px solid ${service.borderColor}`,
                    }}
                  >
                    <div style={{ color: 'white' }}>{service.icon}</div>
                  </div>

                  <h2 className="card-title">{service.title}</h2>
                  <p className="card-desc">{service.description}</p>

                  {service.available ? (
                    <span className="card-action active">
                      Launch
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </span>
                  ) : (
                    <>
                      <span className="coming-soon-badge">Coming Soon</span>
                      <span className="card-action disabled">Not available yet</span>
                    </>
                  )}
                </CardTag>
              );
            })}
          </div>

          {/* Footer */}
          <div className={`mt-20 text-center ${mounted ? 'fade-in fade-in-delay-4' : 'opacity-0'}`}>
            <p className="text-white/20 text-sm">
              &copy; {new Date().getFullYear()} EMEA Clash &mdash; All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
