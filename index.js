let movieTitleEl;
let posterEl;
let ratingsInfoEl;
let movieInfoEl;
let aiSummaryEl;
let searchFormEl;
let searchInputEl;

const FALLBACK_POSTER = './images/Movie_Rating_Poster_Example.webp';

function getRequestedTitle() {
  const params = new URLSearchParams(window.location.search);
  const urlTitle = params.get('title');
  if (urlTitle && urlTitle.trim()) {
    return urlTitle.trim();
  }
  const pageTitle = movieTitleEl?.textContent?.trim();
  return pageTitle || '';
}

function isAiEnabled() {
  const params = new URLSearchParams(window.location.search);
  return params.get('ai') !== 'false';
}

function formatRatingItem(label, value) {
  return `<div class="rating-pill"><strong>${label}</strong><span>${value}</span></div>`;
}

function renderMovieInfo(movie) {
  const infoRows = [
    { label: 'Year', value: movie.year },
    { label: 'Genre', value: movie.genre },
    { label: 'Director', value: movie.director },
    { label: 'Actors', value: movie.actors },
    { label: 'Runtime', value: movie.runtime },
    { label: 'Language', value: movie.language }
  ];

  movieInfoEl.innerHTML = infoRows
    .filter(row => row.value)
    .map(row => `<p><strong>${row.label}:</strong> ${row.value}</p>`)
    .join('');
}

function renderRatings(movie) {
  const rottenTomatoes = movie.ratings?.find(r => r.Source === 'Rotten Tomatoes')?.Value || 'N/A';
  const imdbRating = movie.imdbRating || 'N/A';
  const metascore = movie.metascore || 'N/A';

  ratingsInfoEl.innerHTML = `
    ${formatRatingItem('🎬 IMDb: ', imdbRating)}
    ${formatRatingItem('🍅 Rotten Tomatoes: ', rottenTomatoes)}
    ${formatRatingItem('📊 MetaScore: ', metascore)}
  `;
}

function renderAiSummary(summary, enabled, error) {
  if (error) {
    aiSummaryEl.textContent = `AI summary error: ${error}`;
    return;
  }

  if (summary) {
    aiSummaryEl.textContent = summary;
    return;
  }

  aiSummaryEl.textContent = enabled
    ? 'No AI summary is available for this movie yet.'
    : 'AI summary is turned off.';
}

function renderPoster(movie) {
  if (movie.poster && movie.poster !== 'N/A') {
    posterEl.src = movie.poster;
  } else {
    posterEl.src = FALLBACK_POSTER;
  }

  posterEl.alt = `${movie.title || 'Movie'} poster`;
}

async function fetchMovieData(title, useAi) {
  const url = new URL('/api/movie', window.location.origin);
  url.searchParams.set('title', title);
  if (useAi) {
    url.searchParams.set('ai', 'true');
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to fetch movie data');
  }

  return response.json();
}

function updateSearchInput(title) {
  if (searchInputEl) {
    searchInputEl.value = title;
  }
}

function handleSearch(event) {
  event.preventDefault();
  if (!searchInputEl) return;

  if (searchInputEl.value.trim() === "2025") {
    december();
    return;
  }

  const query = searchInputEl.value.trim();
  if (!query) return;

  const url = new URL(window.location.href);
  url.searchParams.set('title', query);
  if (isAiEnabled()) {
    url.searchParams.set('ai', 'true');
  } else {
    url.searchParams.set('ai', 'false');
  }
  window.history.pushState({}, '', url.toString());
  initialize();
}

async function initialize() {
  const title = getRequestedTitle();
  const useAi = isAiEnabled();

  updateSearchInput(title);

  if (!title) {
    movieTitleEl.textContent = '';
    movieInfoEl.textContent = 'Search for a movie to see details.';
    ratingsInfoEl.innerHTML = '';
    aiSummaryEl.textContent = '';
    posterEl.src = FALLBACK_POSTER;
    return;
  }

  movieTitleEl.textContent = title;
  movieInfoEl.textContent = 'Loading movie details...';
  ratingsInfoEl.innerHTML = '<p>Loading ratings...</p>';
  aiSummaryEl.textContent = useAi ? 'Loading AI summary...' : 'AI summary is turned off.';

  try {
    const data = await fetchMovieData(title, useAi);
    const movie = data.movie;

    movieTitleEl.textContent = movie.title || title;
    renderPoster(movie);
    renderRatings(movie);
    renderMovieInfo(movie);
    renderAiSummary(data.aiSummary, useAi, data.aiError);
  } catch (error) {
    movieInfoEl.textContent = `Unable to load details: ${error.message}`;
    ratingsInfoEl.innerHTML = '';
    aiSummaryEl.textContent = '';
    console.error(error);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  movieTitleEl = document.querySelector('.movie-title');
  posterEl = document.querySelector('.movie-poster');
  ratingsInfoEl = document.querySelector('.ratings-info');
  movieInfoEl = document.querySelector('.movie-info');
  aiSummaryEl = document.querySelector('.ai-summary');
  searchFormEl = document.querySelector('.search-form');
  searchInputEl = document.querySelector('.search-input');

  initialize();
  searchFormEl?.addEventListener('submit', handleSearch);
});

function december(){
    const music = new Audio('./music/EverythingIsOkay.mp3');
    music.play();
    movieInfoEl.textContent = 'You found it...';
    aiSummaryEl.textContent = `... December 2025, I found myself. And everyday is a day to [REDACTED].`;
    posterEl.src = './images/December_2025.webp';
    posterEl.alt = 'December 2025';
    ratingsInfoEl.innerHTML = '';
    searchInputEl.value = '';
}
