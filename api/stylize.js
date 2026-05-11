// Vercel serverless function — proxies image stylization to OpenAI
// Runs on the server, so the API key never touches the browser
// and CORS is not an issue.

export const config = {
  api: {
    bodyParser: false, // we'll handle multipart manually by streaming
  },
  maxDuration: 120, // gpt-image-1 can take 30-90s; allow headroom
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server missing OPENAI_API_KEY env variable' });
  }

  try {
    // Read the raw multipart body and forward it to OpenAI as-is.
    // The browser already built valid multipart/form-data, so we just pipe it.
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.startsWith('multipart/form-data')) {
      return res.status(400).json({ error: 'Expected multipart/form-data' });
    }

    const openaiRes = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': contentType, // includes the multipart boundary
      },
      body,
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      return res.status(openaiRes.status).json({
        error: data?.error?.message || `OpenAI returned ${openaiRes.status}`,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Stylize error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
