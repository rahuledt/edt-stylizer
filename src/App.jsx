import React, { useState, useRef } from 'react';
import { Upload, Download, Sparkles, Image as ImageIcon, AlertCircle, RotateCcw } from 'lucide-react';

const STYLE_PROMPT = `Transform this photograph into a painterly illustration in a specific anime-influenced fine-art style.

Style direction:
- Thick, visible oil-paint brushwork. Confident impressionist strokes, no smooth digital gradients.
- Warm sun-soaked palette: golden yellows, soft creams, dusty teals, muted sage greens, occasional terracotta accents. Balance warm and cool tones — do not let orange dominate.
- Strong directional sunlight casting long warm shadows.
- Soft anime sensibility in the rendering — gentle, painterly features — but DO NOT use generic anime conventions like oversized eyes, idealized faces, or smooth doll-like skin.
- Lived-in domestic intimacy. Quiet, contemplative atmosphere.
- The finish should look hand-painted on canvas, not digital, not photorealistic.

Critical identity rules:
- Preserve the subject's EXACT facial features: face shape, eye shape and spacing, nose, mouth, jawline, ethnicity, skin tone, hair texture and color, body proportions, and approximate age. The person in the output must clearly be the same person as in the input.
- Do not slim, idealize, westernize, or beautify the subject. Render their actual features faithfully, just in this painterly style.
- Preserve their exact pose, clothing, and the surrounding scene composition.

You are restyling the rendering. You are not redesigning the person.`;

export default function App() {
  const [sourceFile, setSourceFile] = useState(null);
  const [sourcePreview, setSourcePreview] = useState(null);
  const [resultImage, setResultImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customPrompt, setCustomPrompt] = useState(STYLE_PROMPT);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('Image must be under 15MB');
      return;
    }
    setError('');
    setResultImage(null);
    setSourceFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setSourcePreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect({ target: { files: [file] } });
  };

  // Normalize the uploaded image into a clean PNG, max 1536px on the long edge.
  // Gemini accepts JPG/PNG/WebP, but downscaling cuts the base64 payload size
  // dramatically and produces faster, cheaper generations.
  const normalizeImage = (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxEdge = 1536;
        let w = img.width;
        let h = img.height;
        if (Math.max(w, h) > maxEdge) {
          const scale = maxEdge / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Could not convert image'));
              return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = reader.result;
              const base64 = dataUrl.split(',')[1];
              resolve({ base64, mimeType: 'image/png' });
            };
            reader.onerror = () => reject(new Error('Could not read converted image'));
            reader.readAsDataURL(blob);
          },
          'image/png'
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read image — try a different file'));
      };
      img.src = url;
    });
  };

  const stylize = async () => {
    if (!sourceFile) return;
    setLoading(true);
    setError('');
    setResultImage(null);

    try {
      const { base64, mimeType } = await normalizeImage(sourceFile);

      const response = await fetch('/api/stylize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          prompt: customPrompt,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || `Request failed: ${response.status}`);
      }

      if (!data.imageBase64) throw new Error('No image returned');
      setResultImage(`data:${data.mimeType || 'image/png'};base64,${data.imageBase64}`);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const downloadResult = () => {
    if (!resultImage) return;
    const a = document.createElement('a');
    a.href = resultImage;
    a.download = `edt-stylized-${Date.now()}.png`;
    a.click();
  };

  const reset = () => {
    setSourceFile(null);
    setSourcePreview(null);
    setResultImage(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-6xl mx-auto px-6 py-8">

        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="text-xs tracking-widest text-stone-500 mb-1">EDT — INTERNAL TOOLS</div>
            <h1 className="text-2xl font-medium">Style Transfer</h1>
            <p className="text-sm text-stone-600 mt-1">Photo → painterly anime, in the EDT visual language</p>
          </div>
          <div className="text-xs text-stone-400">v0.4 · nano-banana</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

          <div className="bg-white border border-stone-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium">Source photo</div>
              {sourceFile && (
                <button onClick={reset} className="text-xs text-stone-500 hover:text-stone-900 flex items-center gap-1">
                  <RotateCcw size={12} /> Clear
                </button>
              )}
            </div>

            {!sourcePreview ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-stone-200 rounded-lg aspect-square flex flex-col items-center justify-center cursor-pointer hover:border-stone-400 hover:bg-stone-50 transition-colors"
              >
                <Upload size={28} className="text-stone-400 mb-3" />
                <div className="text-sm text-stone-600">Click or drop a photo</div>
                <div className="text-xs text-stone-400 mt-1">PNG, JPG, WebP · up to 15MB</div>
              </div>
            ) : (
              <div className="rounded-lg overflow-hidden bg-stone-100 aspect-square">
                <img src={sourcePreview} alt="source" className="w-full h-full object-cover" />
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          <div className="bg-white border border-stone-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium">Stylized output</div>
              {resultImage && (
                <button onClick={downloadResult} className="text-xs text-stone-700 hover:text-stone-900 flex items-center gap-1">
                  <Download size={12} /> Download
                </button>
              )}
            </div>

            <div className="rounded-lg overflow-hidden bg-stone-100 aspect-square flex items-center justify-center">
              {loading ? (
                <div className="text-center">
                  <div className="inline-block w-8 h-8 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin mb-3"></div>
                  <div className="text-sm text-stone-600">Painting your photo</div>
                  <div className="text-xs text-stone-400 mt-1">10–20 seconds</div>
                </div>
              ) : resultImage ? (
                <img src={resultImage} alt="stylized" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center text-stone-400">
                  <ImageIcon size={28} className="mx-auto mb-2 opacity-50" />
                  <div className="text-xs">Output appears here</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-5 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => setShowPromptEditor(!showPromptEditor)}
              className="text-xs text-stone-500 hover:text-stone-900 underline underline-offset-2"
            >
              {showPromptEditor ? 'Hide' : 'Edit'} style prompt
            </button>

            <div className="text-xs text-stone-400">
              Output aspect matches input · ~$0.04 per generation
            </div>

            <div className="ml-auto">
              <button
                onClick={stylize}
                disabled={!sourceFile || loading}
                className="px-5 py-2.5 bg-stone-900 text-white rounded-lg text-sm font-medium hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Sparkles size={16} />
                {loading ? 'Stylizing...' : 'Stylize'}
              </button>
            </div>
          </div>

          {showPromptEditor && (
            <div className="mt-4 pt-4 border-t border-stone-100">
              <div className="text-xs text-stone-500 mb-2">Style prompt — tweak if a generation feels off</div>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={14}
                className="w-full px-3 py-2 text-xs font-mono border border-stone-200 rounded-lg focus:outline-none focus:border-stone-400 leading-relaxed"
              />
              <button
                onClick={() => setCustomPrompt(STYLE_PROMPT)}
                className="text-xs text-stone-500 hover:text-stone-900 mt-2 underline underline-offset-2"
              >
                Reset to default
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 mb-6">
            <AlertCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-900">{error}</div>
          </div>
        )}

        <div className="text-xs text-stone-400 text-center pt-4 border-t border-stone-100">
          Powered by Gemini 2.5 Flash Image. Re-run if a result feels off — generations are non-deterministic.
        </div>
      </div>
    </div>
  );
}
