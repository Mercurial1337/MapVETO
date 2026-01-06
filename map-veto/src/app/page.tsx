import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <header className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="text-center max-w-4xl mx-auto">
          {/* Logo/Title */}
          <h1 className="text-6xl md:text-8xl font-bold mb-6">
            <span className="gradient-text">MAP VETO</span>
          </h1>

          <p className="text-xl md:text-2xl text-white/60 mb-12 max-w-2xl mx-auto">
            Esports-grade map veto system with real-time synchronization for competitive gaming tournaments.
          </p>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="glass rounded-2xl p-6 text-left">
              <div className="text-3xl mb-3">🎮</div>
              <h3 className="text-lg font-semibold text-white mb-2">Multi-Game Support</h3>
              <p className="text-sm text-white/50">
                Built for Valorant, extensible to CS2, CoD, and more.
              </p>
            </div>

            <div className="glass rounded-2xl p-6 text-left">
              <div className="text-3xl mb-3">⚡</div>
              <h3 className="text-lg font-semibold text-white mb-2">Real-time Sync</h3>
              <p className="text-sm text-white/50">
                Instant updates across all participants via WebSocket.
              </p>
            </div>

            <div className="glass rounded-2xl p-6 text-left">
              <div className="text-3xl mb-3">📺</div>
              <h3 className="text-lg font-semibold text-white mb-2">Broadcast Ready</h3>
              <p className="text-sm text-white/50">
                OBS overlay support with transparent backgrounds.
              </p>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/admin"
              className="btn-primary px-8 py-4 text-lg rounded-xl"
            >
              Admin Dashboard
            </Link>

            <Link
              href="/demo"
              className="px-8 py-4 text-lg rounded-xl border border-white/20 text-white hover:bg-white/10 transition-colors"
            >
              View Demo
            </Link>
          </div>
        </div>
      </header>

      {/* Supported Games */}
      <section className="border-t border-white/10 py-12 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm text-white/40 uppercase tracking-wider mb-6">
            Supported Games
          </p>
          <div className="flex items-center justify-center gap-12">
            <div className="text-white/60 hover:text-white transition-colors">
              <span className="text-2xl font-bold">VALORANT</span>
            </div>
            <div className="text-white/30">
              <span className="text-2xl font-bold">CS2</span>
              <span className="text-xs ml-2 text-white/20">(Coming Soon)</span>
            </div>
            <div className="text-white/30">
              <span className="text-2xl font-bold">CoD</span>
              <span className="text-xs ml-2 text-white/20">(Coming Soon)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-sm text-white/40">
          <span>Map VETO Management System</span>
          <span>Built for Esports</span>
        </div>
      </footer>
    </div>
  );
}
