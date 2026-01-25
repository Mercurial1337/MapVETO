# 🎮 MapVETO

A real-time competitive map veto system for esports tournaments. Built with Next.js, Supabase, and Tailwind CSS.

![Next.js](https://img.shields.io/badge/Next.js-16.1-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Realtime-green?logo=supabase)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38bdf8?logo=tailwindcss)

## 📸 Screenshot

![MapVETO Application](MAPBAN%20Sample.png)

## ✨ Features

- **🔄 Real-time Veto System** - Live synchronization between teams with Supabase Realtime
- **🎲 Coin Toss Integration** - Fair randomized starting position selection
- **🗺️ Multiple Formats** - Support for Bo1, Bo3, and Bo5 match formats
- **🔗 Magic Links** - Secure, unique URLs for each team and observers
- **📺 Stream Overlay** - OBS-ready transparent overlays for broadcasts
- **👑 Admin Dashboard** - Full match management and monitoring
- **⚡ Rate Limiting** - Optional Upstash Redis integration for API protection

## 🎯 Veto Formats

| Format | Maps Played | Sequence |
|--------|-------------|----------|
| **Bo1** | 1 map | Ban → Ban → Ban → Ban → Ban → Ban → Decider |
| **Bo3** | 3 maps | Ban → Ban → Pick → Pick → Ban → Ban → Decider |
| **Bo5** | 5 maps | Ban → Ban → Pick → Pick → Pick → Pick → Decider |

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Supabase account
- (Optional) Upstash Redis for rate limiting

### Installation

```bash
# Clone the repository
git clone https://github.com/Mercurial1337/MapVETO.git
cd MapVETO/map-veto

# Install dependencies
npm install

# Copy environment template
cp env.template .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the application.

### Environment Variables

Create a `.env.local` file with:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional: Rate limiting
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
```

## 📖 Usage

### Creating a Match

1. Navigate to **Admin Dashboard** → **Create Match**
2. Enter team names and select the format (Bo1/Bo3/Bo5)
3. Click **Create Match & Generate Links**
4. Share the generated magic links:
   - 🔴 **Team A Link** - Send to the first team
   - 🔵 **Team B Link** - Send to the second team
   - 🟣 **Observer Link** - For casters and admins

### Running the Veto

1. Teams open their unique magic links
2. Match begins with a coin toss
3. Teams alternate banning/picking maps
4. Side selection occurs after each pick
5. Final results display to all participants

### Stream Overlay

1. Go to **Admin** → **Stream Overlay**
2. Select your match and background mode
3. Copy the generated URL
4. In OBS: Add **Browser Source** with the URL
5. Recommended dimensions: `1920x1080`

#### Overlay URL Parameters

| Parameter | Values | Description |
|-----------|--------|-------------|
| `bg` | `transparent`, `chroma` | Background mode |
| `banned` | `true`, `false` | Show/hide banned maps |
| `animate` | `true`, `false` | Enable/disable animations |

## 🔗 URL Reference

| Page | Path |
|------|------|
| Landing / Login | `/` |
| Admin Dashboard | `/admin` |
| Create Match | `/admin/matches/new` |
| Matches List | `/admin/matches` |
| Stream Settings | `/admin/stream` |
| Match Veto | `/match/[id]?token=xxx` |
| Stream Overlay | `/match/[id]/stream` |

## 🛠️ Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with App Router
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Database & Auth**: [Supabase](https://supabase.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Validation**: [Zod](https://zod.dev/)
- **Rate Limiting**: [Upstash Redis](https://upstash.com/) (optional)

## 📦 Project Structure

```
map-veto/
├── src/
│   ├── app/           # Next.js App Router pages
│   │   ├── admin/     # Admin dashboard routes
│   │   ├── api/       # API routes
│   │   └── match/     # Match veto pages
│   ├── components/    # React components
│   ├── hooks/         # Custom React hooks
│   ├── lib/           # Utilities and configurations
│   └── types/         # TypeScript type definitions
├── public/
│   └── maps/          # Map images
└── supabase/          # Database schema
```

## 🚢 Deployment

See [DEPLOYMENT.md](map-veto/DEPLOYMENT.md) for detailed deployment instructions.

### Quick Deploy to Vercel

1. Push to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Add environment variables
4. Deploy!

## 📄 License

This project is private and not licensed for public distribution.

---

<p align="center">
  Made with ❤️ for the esports community
</p>
