# EDT Stylizer

Internal tool for converting photos into EDT's painterly anime visual language. Frontend in React, backend is a single Vercel serverless function that proxies to OpenAI's `gpt-image-1`.

## Why a proxy?

Browsers block direct calls to `api.openai.com` (no CORS headers). The serverless function lives on Vercel's infrastructure, calls OpenAI server-side, and returns the result to the browser. As a bonus, the API key lives as an env variable on Vercel — never in browser memory, never typed in by users.

## Deploy in 5 steps

### 1. Install dependencies

```bash
npm install
```

### 2. Test locally (optional)

You need the Vercel CLI to run the serverless function locally:

```bash
npm install -g vercel
vercel dev
```

You'll be prompted for the env variable on first run (or set it via `vercel env add OPENAI_API_KEY`).

If you skip `vercel dev` and run `npm run dev` instead, the frontend loads but `/api/stylize` will 404 — that's expected.

### 3. Push to GitHub

```bash
git init
git add .
git commit -m "Initial EDT Stylizer"
git remote add origin <your-repo-url>
git push -u origin main
```

### 4. Deploy on Vercel

- Go to vercel.com → New Project → Import the repo
- Framework preset: **Vite**
- Build command: `npm run build` (auto-detected)
- Output directory: `dist` (auto-detected)
- Before deploying, click **Environment Variables** and add:
  - Name: `OPENAI_API_KEY`
  - Value: your OpenAI team key
- Deploy

### 5. Lock it down (optional but recommended for internal use)

By default the URL is public. For an EDT-only tool, add password protection:

- Vercel dashboard → Project → Settings → Deployment Protection
- Enable "Password Protection" (Pro plan) OR
- Add Vercel Authentication restricted to your EDT team's emails

Or skip Vercel auth and use a shared password via a simple middleware. Ask if you want that added.

## Architecture

```
Browser (React)
    │
    │  POST /api/stylize  (multipart with image + prompt)
    ▼
Vercel serverless function  ← OPENAI_API_KEY env var
    │
    │  POST https://api.openai.com/v1/images/edits
    ▼
OpenAI gpt-image-1
    │
    │  base64 image returned
    ▼
Function → Browser → Display + download
```

## Cost notes

OpenAI bills per image based on size and quality:
- Low quality 1024×1024: ~$0.02
- Medium 1024×1024: ~$0.06
- High 1024×1024: ~$0.17
- High 1536×1024 (landscape): ~$0.19

Vercel function execution is essentially free for this volume (10,000 free invocations / month on Hobby).

## Tweaking the style prompt

The default prompt in `src/App.jsx` is calibrated to the reference set Rahul provided (warm sun, dusty teals, thick brushwork, soft anime figures). The in-app "Edit style prompt" toggle lets the team adjust it without redeploying. Permanent changes go in the `STYLE_PROMPT` constant.

## Known limitations

- Identity drift on faces — gpt-image-1 isn't as strong as a trained LoRA at preserving exact likenesses
- Style fidelity is ~60–75% of the original Midjourney aesthetic; for exact-match, train a LoRA on existing outputs
- 30–90 second generation time at high quality
- Non-deterministic — re-run if a result feels off
