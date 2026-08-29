const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const OMDB_API_KEY = process.env.OMDB_API_KEY || process.env.IMDB_API_KEY || process.env.IMBD_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const twentyTwentyFive = process.env.REDACTED;

if (!OMDB_API_KEY) {
  console.warn('Warning: OMDB_API_KEY / IMDB_API_KEY / IMBD_API_KEY is not set. Movie lookups will fail.');
}

if (!GROQ_API_KEY) {
  console.warn('Note: GROQ_API_KEY is not set. AI summaries will be skipped.');
}

app.use(express.static(path.join(__dirname)));

const SKIP_MODEL_PARTS = [
  'whisper',
  'guard',
  'orpheus',
  'compound',
  'tts',
  'safeguard'
];

const PREFERRED_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'qwen/qwen3.6-27b',
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile'
];

let cachedModelId = process.env.GROQ_MODEL || null;
let cachedModelAt = 0;
const MODEL_CACHE_MS = 1000 * 60 * 60;

function isChatModel(id) {
  const lower = String(id || '').toLowerCase();
  return !SKIP_MODEL_PARTS.some((part) => lower.includes(part));
}

async function listGroqModels() {
  const response = await fetch('https://api.groq.com/openai/v1/models', {
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Failed to list Groq models.');
  }

  return Array.isArray(data.data) ? data.data : [];
}

async function resolveGroqModel() {
  if (process.env.GROQ_MODEL) {
    return process.env.GROQ_MODEL;
  }

  const now = Date.now();
  if (cachedModelId && now - cachedModelAt < MODEL_CACHE_MS) {
    return cachedModelId;
  }

  const models = await listGroqModels();
  const chatModels = models.filter((model) => isChatModel(model.id));
  const availableIds = new Set(chatModels.map((model) => model.id));

  const preferredHit = PREFERRED_MODELS.find((id) => availableIds.has(id));
  if (preferredHit) {
    cachedModelId = preferredHit;
    cachedModelAt = now;
    console.log(`Using Groq model: ${cachedModelId}`);
    return cachedModelId;
  }

  chatModels.sort((a, b) => (b.created || 0) - (a.created || 0));
  cachedModelId = chatModels[0]?.id || 'openai/gpt-oss-20b';
  cachedModelAt = now;
  console.log(`Using Groq model: ${cachedModelId}`);
  return cachedModelId;
}

app.get('/api/movie', async (req, res) => {
  const title = String(req.query.title || '').trim();
  if (!title) {
    return res.status(400).json({ error: 'Missing required query parameter: title' });
  }

  if (!OMDB_API_KEY) {
    return res.status(500).json({ error: 'Missing OMDB_API_KEY in environment.' });
  }

  try {
    if (title.toLowerCase() === 'redacted') {
      return res.json(twentyTwentyFive);
    }

    const omdbUrl = new URL('https://www.omdbapi.com/');
    omdbUrl.searchParams.set('apikey', OMDB_API_KEY);
    omdbUrl.searchParams.set('t', title);
    omdbUrl.searchParams.set('plot', 'full');

    let omdbResponse = await fetch(omdbUrl.toString());
    let omdbData = await omdbResponse.json();

    if (omdbData.Response === 'False') {
      const searchUrl = new URL('https://www.omdbapi.com/');
      searchUrl.searchParams.set('apikey', OMDB_API_KEY);
      searchUrl.searchParams.set('s', title);
      searchUrl.searchParams.set('type', 'movie');

      const searchResponse = await fetch(searchUrl.toString());
      const searchData = await searchResponse.json();

      if (searchData.Response === 'True' && Array.isArray(searchData.Search) && searchData.Search.length > 0) {
        const firstResult = searchData.Search[0];
        const detailUrl = new URL('https://www.omdbapi.com/');
        detailUrl.searchParams.set('apikey', OMDB_API_KEY);
        detailUrl.searchParams.set('i', firstResult.imdbID);
        detailUrl.searchParams.set('plot', 'full');

        const detailResponse = await fetch(detailUrl.toString());
        omdbData = await detailResponse.json();
      }
    }

    if (omdbData.Response === 'False') {
      return res.status(404).json({ error: omdbData.Error || 'Movie not found' });
    }

    const movieResult = {
      title: omdbData.Title,
      year: omdbData.Year,
      rated: omdbData.Rated,
      released: omdbData.Released,
      runtime: omdbData.Runtime,
      genre: omdbData.Genre,
      director: omdbData.Director,
      actors: omdbData.Actors,
      plot: omdbData.Plot,
      poster: omdbData.Poster,
      ratings: omdbData.Ratings,
      imdbRating: omdbData.imdbRating,
      metascore: omdbData.Metascore,
      language: omdbData.Language,
      country: omdbData.Country,
      awards: omdbData.Awards,
      website: omdbData.Website,
      raw: omdbData
    };

    if (req.query.ai !== 'false') {
      let aiSummary = null;
      let aiError = null;

      try {
        aiSummary = await generateAiSummary(movieResult);
      } catch (err) {
        aiError = err?.message || 'Failed to generate AI summary.';
      }

      return res.json({ movie: movieResult, aiSummary, aiError });
    }

    return res.json({ movie: movieResult });
  } catch (error) {
    console.error('Movie API error:', error);
    return res.status(500).json({ error: 'Failed to fetch movie data' });
  }
});

async function generateAiSummary(movie) {
  if (!GROQ_API_KEY) {
    throw new Error('Groq API key is not configured.');
  }

  const model = await resolveGroqModel();
  const prompt = [
    `Write a short, simple summary of the movie "${movie.title}" (${movie.year || 'year unknown'}).`,
    movie.genre ? `Genre: ${movie.genre}.` : '',
    movie.plot ? `Plot from the database: ${movie.plot}` : '',
    'Keep it to 3 or 4 sentences. Do not invent awards or ratings.'
  ].filter(Boolean).join(' ');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful movie summary assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 1024
    })
  });

  const data = await response.json();

  if (!response.ok) {
    cachedModelId = null;
    cachedModelAt = 0;
    const errorMessage = data?.error?.message || 'Groq API returned an error.';
    throw new Error(errorMessage);
  }

  return data?.choices?.[0]?.message?.content?.trim();
}

app.listen(PORT, () => {
  console.log(`Movie Ratings server running on http://localhost:${PORT}`);
  console.log('Use /api/movie?title=Backrooms');
});
