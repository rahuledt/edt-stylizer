// Vercel serverless function — proxies image stylization to
// Google's Gemini 2.5 Flash Image (a.k.a. "Nano Banana").
//
// The browser sends JSON: { imageBase64, mimeType, prompt }
// We forward to Gemini's generateContent endpoint with the image
// inline. Gemini returns text + an image part; we extract the image
// and send the base64 back to the browser.

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb', // image base64 inflates ~33%; 20MB is plenty for our 1024px input
    },
  },
  maxDuration: 60,
};

const MODEL = 'gemini-2.5-flash-image-preview';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server missing GEMINI_API_KEY env variable' });
  }

  try {
    const { imageBase64, mimeType, prompt } = req.body || {};
    if (!imageBase64 || !mimeType || !prompt) {
      return res.status(400).json({ error: 'Missing imageBase64, mimeType, or prompt' });
    }

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: prompt },
          ],
        },
      ],
      // Tell Gemini we want an image back, not just text
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    };

    const geminiRes = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      return res.status(geminiRes.status).json({
        error: data?.error?.message || `Gemini returned ${geminiRes.status}`,
      });
    }

    // Find the image part in the response.
    // Response shape: { candidates: [{ content: { parts: [{ inlineData: { data, mimeType } }] } }] }
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inlineData || p.inline_data);
    if (!imagePart) {
      // Gemini sometimes refuses politely with text — surface that to the user.
      const textPart = parts.find((p) => p.text);
      const reason = textPart?.text || 'No image returned from Gemini';
      return res.status(502).json({ error: reason });
    }

    const inline = imagePart.inlineData || imagePart.inline_data;
    return res.status(200).json({
      imageBase64: inline.data,
      mimeType: inline.mimeType || inline.mime_type || 'image/png',
    });
  } catch (err) {
    console.error('Stylize error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
