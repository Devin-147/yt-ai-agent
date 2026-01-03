'use client';

import { useState } from 'react';

export default function Home() {
  const [urls, setUrls] = useState<string[]>(['']);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');

  const addUrl = () => {
    if (urls.length < 5) setUrls([...urls, '']);
  };

  const removeUrl = (index: number) => {
    setUrls(urls.filter((_, i) => i !== index));
  };

  const updateUrl = (index: number, value: string) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
  };

  const submit = async () => {
    const validUrls = urls.filter(u => u.trim());
    if (validUrls.length === 0) {
      setError('Please add at least one YouTube URL');
      return;
    }

    setLoading(true);
    setError('');
    setResult('');

    try {
      const res = await fetch('/api/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: validUrls })
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setResult(data.script);
      }
    } catch (err) {
      setError('Network error — please check your connection');
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-900 via-slate-900 to-black text-white">
      <div className="max-w-5xl mx-auto px-8 py-16">
        <h1 className="text-5xl font-bold text-center mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
          YT AI Agent
        </h1>
        <p className="text-xl text-center text-gray-300 mb-12">
          Paste up to 5 YouTube URLs → get one clean, rewritten script
        </p>

        <div className="space-y-4 mb-10">
          {urls.map((url, i) => (
            <div key={i} className="flex gap-4 items-center">
              <input
                type="text"
                value={url}
                onChange={(e) => updateUrl(i, e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 px-6 py-4 bg-slate-800 border border-slate-700 rounded-xl text-lg focus:outline-none focus:border-purple-500 transition"
              />
              {urls.length > 1 && (
                <button
                  onClick={() => removeUrl(i)}
                  className="text-3xl text-red-400 hover:text-red-300 transition"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {urls.length < 5 && (
          <button
            onClick={addUrl}
            className="mb-10 text-purple-400 hover:text-purple-300 text-lg transition"
          >
            + Add Another URL
          </button>
        )}

        <button
          onClick={submit}
          disabled={loading}
          className="w-full py-6 bg-gradient-to-r from-purple-600 to-pink-600 text-2xl font-semibold rounded-xl shadow-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-70 disabled:cursor-not-allowed transition transform hover:scale-105"
        >
          {loading ? 'Rewriting with AI... (10–60s)' : 'Rewrite with AI'}
        </button>

        {error && (
          <div className="mt-10 p-8 bg-red-900 bg-opacity-50 border border-red-700 rounded-xl text-center">
            <p className="text-xl">{error}</p>
          </div>
        )}

        {result && (
          <div className="mt-16">
            <h2 className="text-4xl font-bold text-center mb-8 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
              Your Rewritten Script
            </h2>
            <div className="p-10 bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl">
              <pre className="text-lg leading-relaxed whitespace-pre-wrap font-sans text-gray-100">
                {result}
              </pre>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
