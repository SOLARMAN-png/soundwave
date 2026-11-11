export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

let refreshInFlight;
let csrfToken;
let csrfTokenInFlight;

function sendApiRequest(path, options) {
  return fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...options,
  });
}

async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  if (!csrfTokenInFlight) {
    csrfTokenInFlight = sendApiRequest("/api/auth/csrf", {})
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || typeof payload.data?.csrfToken !== "string") {
          throw new Error(payload.error || "Could not initialize request security");
        }
        csrfToken = payload.data.csrfToken;
        return csrfToken;
      })
      .finally(() => {
        csrfTokenInFlight = undefined;
      });
  }
  return csrfTokenInFlight;
}

function withCsrfHeader(options, token) {
  const headers = new Headers(options.headers);
  headers.set("X-CSRF-Token", token);
  return { ...options, headers };
}

async function sendStateChangingRequest(path, options) {
  let token = await getCsrfToken();
  let response = await sendApiRequest(path, withCsrfHeader(options, token));
  const payload = response.status === 403
    ? await response.clone().json().catch(() => ({}))
    : {};

  if (payload.code === "CSRF_INVALID") {
    csrfToken = undefined;
    token = await getCsrfToken();
    response = await sendApiRequest(path, withCsrfHeader(options, token));
  }

  return response;
}

function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = sendStateChangingRequest("/api/auth/refresh", { method: "POST" })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = undefined;
      });
  }

  return refreshInFlight;
}

export async function apiRequest(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const isStateChanging = !["GET", "HEAD", "OPTIONS"].includes(method);
  let response = isStateChanging
    ? await sendStateChangingRequest(path, options)
    : await sendApiRequest(path, options);
  const isAuthEndpoint = /^\/api\/auth\/(?:register|resend-verification|login|logout|refresh)(?:\?|$)/.test(path);

  if (response.status === 401 && !isAuthEndpoint && await refreshAccessToken()) {
    response = isStateChanging
      ? await sendStateChangingRequest(path, options)
      : await sendApiRequest(path, options);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || "The request could not be completed");
    error.status = response.status;
    error.code = payload.code;
    error.details = payload.details;
    throw error;
  }

  if (path === "/api/auth/logout") csrfToken = undefined;
  return payload.data;
}

export function getCurrentUser() {
  return apiRequest("/api/auth/me");
}

export function resendVerificationEmail(email) {
  return apiRequest("/api/auth/resend-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export function getPublishedGenres() {
  return apiRequest("/api/genres");
}

export function getArtists({ query = "", limit = 50 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query.trim()) params.set("q", query.trim());
  return apiRequest(`/api/artists?${params}`);
}

export async function getPublishedTracks({ query = "", limit = 20 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query.trim()) params.set("q", query.trim());

  const result = await apiRequest(`/api/tracks?${params}`);
  return result.map(formatTrack);
}

export async function getPublishedAlbums({ query = "", limit = 20 } = {}) {
  const params = new URLSearchParams({ limit: String(limit), sort: "recent" });
  if (query.trim()) params.set("q", query.trim());

  const result = await apiRequest(`/api/albums?${params}`);
  return result.map(formatAlbum);
}

export async function getPublishedAlbum(id) {
  const album = await apiRequest(`/api/albums/${encodeURIComponent(id)}`);
  return {
    ...formatAlbum(album),
    tracks: (album.tracks || []).map(formatTrack),
  };
}

export async function getRecommendedTracks() {
  const result = await apiRequest("/api/recommendations");
  return result.map(formatTrack);
}

export async function getLikedTracks({ limit = 50 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  const result = await apiRequest(`/api/library/tracks?${params}`);
  return result.map(({ track }) => formatTrack(track));
}

export async function setTrackLiked(trackId, liked) {
  return apiRequest(`/api/library/tracks/${encodeURIComponent(trackId)}`, {
    method: liked ? "PUT" : "DELETE",
  });
}

function formatTrack(track) {
  return {
    ...track,
    artist: track.artistIds?.map((artist) => artist.name).filter(Boolean).join(", ") || "Unknown artist",
    image: track.artworkUrl || track.albumId?.artworkUrl || "",
  };
}

function formatAlbum(album) {
  const artist = album.artistIds?.map((entry) => entry.name).filter(Boolean).join(", ") || "Unknown artist";
  return {
    ...album,
    artist,
    image: album.artworkUrl || "",
  };
}

export async function getPlaybackHistory({ limit = 50 } = {}) {
  const events = await apiRequest(`/api/history?${new URLSearchParams({ limit: String(limit) })}`);
  const seenTrackIds = new Set();
  return events.reduce((tracks, event) => {
    const track = event.track;
    const trackId = track?._id?.toString();
    if (!track || !trackId || seenTrackIds.has(trackId)) return tracks;

    seenTrackIds.add(trackId);
    tracks.push(formatTrack(track));
    return tracks;
  }, []).slice(0, 3);
}

export async function recordPlayback(trackId) {
  return apiRequest("/api/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trackId }),
  });
}