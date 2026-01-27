# Map VETO - Deployment & Usage Guide

## 🚀 Quick Deployment (3 Steps)

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → Create new project
2. Open **SQL Editor** → Paste contents of `supabase/schema.sql` → Run
3. Copy your credentials from **Settings > API**:
   - Project URL
   - `anon` public key
   - `service_role` secret key

### Step 2: Deploy to Vercel

```bash
# Option A: One-click deploy
# Push to GitHub, then import at vercel.com/new

# Option B: CLI deploy
npx vercel
```

Add these environment variables in Vercel dashboard:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `NEXT_PUBLIC_APP_URL` | Your Vercel URL |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service Account email (`client_email`) |
| `GOOGLE_PRIVATE_KEY` | Full private key from JSON (including \n) |

### Step 3: Configure Google Sheets (New Export Feature)

1.  **Get Credentials**: Open your Service Account JSON file.
2.  **Add to Vercel**:
    *   `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Copy exactly.
    *   `GOOGLE_PRIVATE_KEY`: Copy the **entire** block including `-----BEGIN...` and `...END PRIVATE KEY-----\n`. If using Vercel, wrap it in double quotes if it's a single raw string with `\n`.
3.  **Share your Sheets**: You **MUST** share any Google Sheet you want to export to with your Service Account email as an **Editor**.

### Step 4: (Optional) Add Rate Limiting

1. Create account at [upstash.com](https://upstash.com)
2. Create Redis database
3. Add to Vercel:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

---

## 📖 How to Use

### Creating a Match

1. Go to **Admin Dashboard** → **Create Match**
2. Enter team names and select format (Bo1/Bo3/Bo5)
3. Click **Create Match & Generate Links**
4. You'll receive 3 magic links:
   - 🔴 **Team A link** - Send to first team
   - 🔵 **Team B link** - Send to second team
   - 🟣 **Observer link** - For casters/admins

### Running the Veto

1. Teams open their magic links
2. Match starts with coin toss
3. Teams take turns banning/picking maps
4. Side selection happens after each pick
5. Final results shown to all viewers

### OBS Stream Overlay

1. Go to **Admin** → **Stream Overlay**
2. Select your match and background mode
3. Copy the generated URL
4. In OBS: Add **Browser Source** with URL
5. Set dimensions: `1920x1080` (results) or `1920x200` (live bar)

---

## 🎮 Veto Formats

| Format | Maps | Sequence |
|--------|------|----------|
| **Bo1** | 1 map | Ban-Ban-Ban-Ban-Ban-Ban → Decider |
| **Bo3** | 3 maps | Ban-Ban-Pick-Pick-Ban-Ban → Decider |
| **Bo5** | 5 maps | Ban-Ban-Pick-Pick-Pick-Pick → Decider |

---

## 🔗 URLs Reference

| Page | Path |
|------|------|
| Landing | `/` |
| Admin Dashboard | `/admin` |
| Create Match | `/admin/matches/new` |
| Matches List | `/admin/matches` |
| Stream Settings | `/admin/stream` |
| Match Veto | `/match/[id]?token=xxx` |
| Stream Overlay | `/match/[id]/stream` |
| Live Bar | `/match/[id]/overlay` |

---

## ⚡ Tips

- **Transparent background**: Add `?bg=transparent` to overlay URLs
- **Chroma key**: Use `?bg=chroma` for green screen
- **Hide banned maps**: Add `?banned=false`
- **No animations**: Add `?animate=false`
