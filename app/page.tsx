'use client';

import { useState } from 'react';

export default function Home() {
  const [urls, setUrls] = useState(['']);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const addField = () => setUrls([...urls, '']);
  const removeField = (i: number) => setUrls(urls.filter((_, idx) => idx !== i));

  const submit = async () => {
    const validUrls = urls.filter(u => u.trim());
    if (!validUrls.length) return alert('Add at least one URL');

    setLoading(true);
    setError('');
    setResult('');

    const res = await fetch('/api/rewrite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: validUrls })
    });

    const data = await res.json();
    setLoading(false);
    if (data.error) setError(data.error);
    else setResult(data.script);
  };

  return (
    <main className="max-w-4xl mx-auto p-10 bg-gray-900 text-white min-h-screen">
      <h1 className="text-4xl font-bold mb-4">YT AI Agent</h1>
      <p className="text-xl mb-8 text-gray-300">Paste up to 5 YouTube URLs → get one rewritten script</p>

      {urls.map((url, i) => (
        <div key={i} className="flex gap-3 mb-4">
          <input
            type="text"
            value={url}
            onChange={e => {
              const newUrls = [...urls];
              newUrls[i] = e.target.value;
              setUrls(newUrls);
            }}
            placeholder="https://www.youtube.com/watch?v=..."
            className="flex-1 px-5 py-4 bg-gray-800 rounded-lg text-lg"
          />
          {urls.length > 1 && (
            <button onClick={() => removeField(i)} className="px-5 text-red-400 text-2xl">×</button>
          )}
        </div>
      ))}

      {urls.length < 5 && (
        <button onClick={addField} className="mb-8 text-purple-400 text-lg">+ Add URL</button>
      )}

      <button
        onClick={submit}
        disabled={loading}
        className="w-full py-5 bg-purple-600 text-xl rounded-lg disabled:opacity-60"
      >
        {loading ? 'Generating... (10–60s)' : 'Rewrite with AI'}
      </button>

      {error && <p className="mt-10 p-6 bg-red-900 rounded-lg">{error}</p>}

      {result && (
        <div className="mt-12">
          <h2 className="text-3xl font-bold mb-6">Rewritten Script</h2>
          <pre className="p-8 bg-black rounded-lg text-green-400 whitespace-pre-wrap font-mono text-lg">
            {result}
          </pre>
        </div>
      )}
    </main>
  );
}
