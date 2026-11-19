import { getOfflineLikedSongs, getOfflinePlaylistDetails, listOfflinePlaylists } from "./offline.js";

const fallbackApiUrl = import.meta.env.DEV ? "http://localhost:3000" : "";
export const API_BASE_URL = (import.meta.env.VITE_API_URL || fallbackApiUrl || window.location.origin).replace(/\/$/, "");

if (!import.meta.env.VITE_API_URL && import.meta.env.PROD) {
  console.warn("VITE_API_URL is not set. Configure the deployed backend origin in Vercel for production requests.");
}

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

export async function getLikedTracks({ limit = 50, page = 1, userId } = {}) {
  const params = new URLSearchParams({ limit: String(limit), page: String(page) });
  try {
    const result = await apiRequest(`/api/library/tracks?${params}`);
    return result.map(({ track }) => formatTrack(track));
  } catch (error) {
    const offlineTracks = await getOfflineLikedSongs(userId).catch(() => null);
    if (offlineTracks) return offlineTracks.slice((page - 1) * limit, page * limit);
    throw error;
  }
}

export async function getAllLikedTracks({ userId } = {}) {
  const tracks = [];
  let page = 1;
  let currentPage;
  do {
    currentPage = await getLikedTracks({ limit: 50, page, userId });
    tracks.push(...currentPage);
    page += 1;
  } while (currentPage.length === 50);
  return tracks;
}

export function clearLikedTracks() {
  return apiRequest("/api/library/tracks", { method: "DELETE" });
}

export function createLikedTracksSharePlaylist() {
  return apiRequest("/api/library/tracks/share", { method: "POST" });
}

export async function getPlaylists({ page = 1, limit = 50 } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  try {
    const result = await apiRequest(`/api/playlists?${params}`);
    const offlinePlaylists = await listOfflinePlaylists().catch(() => []);
    const offlineIds = new Set(offlinePlaylists.map((playlist) => playlist._id));
    return result.map((playlist) => ({
        ...playlist,
        offline: offlineIds.has(playlist._id),
      }));
  } catch (error) {
    const offlinePlaylists = await listOfflinePlaylists().catch(() => []);
    if (offlinePlaylists.length) {
      return offlinePlaylists.slice((page - 1) * limit, page * limit);
    }
    throw error;
  }
}

export function createPlaylist(playlist) {
  return apiRequest("/api/playlists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(playlist),
  });
}

export function updatePlaylist(playlistId, changes) {
  return apiRequest(`/api/playlists/${encodeURIComponent(playlistId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
}

export function deletePlaylist(playlistId) {
  return apiRequest(`/api/playlists/${encodeURIComponent(playlistId)}`, {
    method: "DELETE",
  });
}

export async function getPlaylist(id) {
  try {
    const playlist = await apiRequest(`/api/playlists/${encodeURIComponent(id)}`);
    return {
      ...playlist,
      tracks: (playlist.tracks || []).flatMap((entry) => {
        if (!entry.trackId) return [];
        return [{
          ...entry,
          track: formatTrack(entry.trackId),
        }];
      }),
    };
  } catch (error) {
    const offlinePlaylist = await getOfflinePlaylistDetails(id).catch(() => null);
    if (offlinePlaylist) return offlinePlaylist;
    throw error;
  }
}

export function addTrackToPlaylist(playlistId, trackId) {
  return apiRequest(`/api/playlists/${encodeURIComponent(playlistId)}/tracks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trackId }),
  });
}

export function removeTrackFromPlaylist(playlistId, trackId) {
  return apiRequest(
    `/api/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(trackId)}`,
    { method: "DELETE" },
  );
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

export function updatePlaybackMetrics(eventId, metrics) {
  return apiRequest(`/api/history/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metrics),
  });
}

export function getListeningAnalytics({ period = "30d", granularity = "day", startDate, endDate } = {}) {
  const params = new URLSearchParams({ period, granularity });
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  return apiRequest(`/api/analytics?${params}`);
}