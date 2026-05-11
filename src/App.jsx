import React, { useState, useRef } from 'react';
import { Upload, Download, Sparkles, Image as ImageIcon, AlertCircle, RotateCcw } from 'lucide-react';

const STYLE_PROMPT = `Transform this photograph into a painterly anime-style illustration with these exact characteristics:

- Thick, visible oil-paint brushwork with confident impressionist strokes
- Warm, sun-soaked color palette: golden yellows, soft creams, dusty teals, muted sage greens, terracotta accents
- Strong directional sunlight casting long warm shadows across the scene
- Soft anime-adjacent character rendering: gentle features, painterly hair, no harsh outlines
- Lived-in domestic intimacy and quiet atmosphere
- Subtle film-grain texture, slight color bleeding at edges
- Composition feels hand-painted, not digital or photorealistic
- Plants, sunlight on tiled or wooden surfaces, and warm interior light wherever they fit naturally
- Anime/illustration style, NOT photorealistic

Preserve the subject's identity, pose, clothing, and the overall scene composition. Restyle the rendering, not the content.`;

export default function App() {
  const [sourceFile, setSourceFile] = useState(null);
  const [sourcePreview, setSourcePreview] = useState(null);
  const [resultImage, setResultImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customPrompt, setCustomPrompt] = useState(STYLE_PROMPT);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState('high');
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('Image must be under 20MB');
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

  // Normalize any uploaded image into a clean PNG matching the target size.
  // gpt-image-1's /edits endpoint is strict about format — converting in-browser
  // sidesteps "Invalid image file" errors from HEIC, odd JPEGs, alpha channels, etc.
  // It also crops/fits the image to match the selected output dimensions so the
  // subject framing is predictable.
  const normalizeToPng = (file, targetSize) => {
    const [tw, th] = targetSize.split('x').map(Number);
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        // Center-crop the source to match the target aspect ratio, then scale to fit.
        const targetAspect = tw / th;
        const sourceAspect = img.width / img.height;
        let sx, sy, sw, sh;
        if (sourceAspect > targetAspect) {
          // Source wider than target — crop sides
          sh = img.height;
          sw = sh * targetAspect;
          sx = (img.width - sw) / 2;
          sy = 0;
        } else {
          // Source taller than target — crop top/bottom
          sw = img.width;
          sh = sw / targetAspect;
          sx = 0;
          sy = (img.height - sh) / 2;
        }
        const canvas = document.createElement('canvas');
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, tw, th);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Could not convert image'));
            return;
          }
          const pngFile = new File([blob], 'source.png', { type: 'image/png' });
          resolve(pngFile);
        }, 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read image — try a different file (PNG or JPG)'));
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
      const pngFile = await normalizeToPng(sourceFile, size);

      const formData = new FormData();
      formData.append('model', 'gpt-image-1');
      formData.append('image', pngFile);
      formData.append('prompt', customPrompt);
      formData.append('size', size);
      formData.append('quality', quality);
      formData.append('n', '1');

      // Calls our own serverless function, not OpenAI directly.
      // The function lives at /api/stylize and forwards to OpenAI server-side.
      const response = await fetch('/api/stylize', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || `Request failed: ${response.status}`);
      }

      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) throw new Error('No image returned');
      setResultImage(`data:image/png;base64,${b64}`);
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

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="text-xs tracking-widest text-stone-500 mb-1">EDT — INTERNAL TOOLS</div>
            <h1 className="text-2xl font-medium">Style Transfer</h1>
            <p className="text-sm text-stone-600 mt-1">Photo → painterly anime, in the EDT visual language</p>
          </div>
          <div className="text-xs text-stone-400">v0.3 · gpt-image-1</div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

          {/* Source */}
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
                <div className="text-xs text-stone-400 mt-1">PNG, JPG, WebP · up to 20MB</div>
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

          {/* Result */}
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
                  <div className="text-xs text-stone-400 mt-1">30–90 seconds</div>
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

        {/* Controls */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 mb-6">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-stone-500">Size</label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="text-sm px-3 py-1.5 border border-stone-200 rounded-md focus:outline-none focus:border-stone-400 bg-white"
              >
                <option value="1024x1024">Square · 1024</option>
                <option value="1536x1024">Landscape · 1536×1024</option>
                <option value="1024x1536">Portrait · 1024×1536</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-stone-500">Quality</label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="text-sm px-3 py-1.5 border border-stone-200 rounded-md focus:outline-none focus:border-stone-400 bg-white"
              >
                <option value="low">Low · fastest, ~$0.02</option>
                <option value="medium">Medium · ~$0.06</option>
                <option value="high">High · ~$0.19</option>
              </select>
            </div>

            <button
              onClick={() => setShowPromptEditor(!showPromptEditor)}
              className="text-xs text-stone-500 hover:text-stone-900 underline underline-offset-2"
            >
              {showPromptEditor ? 'Hide' : 'Edit'} style prompt
            </button>

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
                rows={10}
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
          Cost per generation depends on size and quality. Re-run if a result feels off — generations are non-deterministic.
        </div>
      </div>
    </div>
  );
}
