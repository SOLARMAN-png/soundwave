const DATABASE_NAME = "soundwave-offline";
const DATABASE_VERSION = 1;
const TRACK_STORE = "tracks";
const PLAYLIST_STORE = "playlists";
const MAX_PLAYLIST_BYTES = 500 * 1024 * 1024;
const DEFAULT_AVAILABLE_BYTES = 250 * 1024 * 1024;

function openDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("Offline storage is not available in this browser."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(TRACK_STORE)) {
        database.createObjectStore(TRACK_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(PLAYLIST_STORE)) {
        database.createObjectStore(PLAYLIST_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open offline storage."));
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Offline storage request failed."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Offline storage transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Offline storage transaction was aborted."));
  });
}

async function getRecord(storeName, id) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readonly");
    return await requestValue(transaction.objectStore(storeName).get(id));
  } finally {
    database.close();
  }
}

async function putRecord(storeName, record) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    const done = transactionDone(transaction);
    await requestValue(transaction.objectStore(storeName).put(record));
    await done;
  } finally {
    database.close();
  }
}

function readBlob(response, maxBytes) {
  if (!response.body?.getReader) {
    return response.blob().then((blob) => {
      if (blob.size > maxBytes) throw new Error("This playlist exceeds the available offline storage.");
      return blob;
    });
  }

  return (async () => {
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error("This playlist exceeds the available offline storage.");
      }
      chunks.push(value);
    }
    return new Blob(chunks, { type: response.headers.get("content-type") || "audio/mpeg" });
  })();
}

export async function getOfflineTrackBlob(trackId) {
  if (!trackId) return null;
  const record = await getRecord(TRACK_STORE, trackId);
  return record?.blob instanceof Blob ? record.blob : null;
}

export async function getOfflinePlaylist(playlistId) {
  if (!playlistId) return null;
  return (await getRecord(PLAYLIST_STORE, playlistId)) || null;
}

export async function listOfflinePlaylists() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PLAYLIST_STORE, "readonly");
    const records = await requestValue(transaction.objectStore(PLAYLIST_STORE).getAll());
    return records.filter((record) => !record.id.startsWith("liked:")).map((record) => ({
      _id: record.id,
      name: record.name,
      artworkUrl: record.artworkUrl || "",
      visibility: record.visibility || "private",
      updatedAt: record.updatedAt,
      trackCount: (record.tracks || []).length,
      offline: true,
    }));
  } finally {
    database.close();
  }
}

export async function getOfflinePlaylistDetails(playlistId) {
  const record = await getOfflinePlaylist(playlistId);
  if (!record) return null;
  return {
    _id: record.id,
    name: record.name,
    description: record.description || "",
    artworkUrl: record.artworkUrl || "",
    visibility: record.visibility || "private",
    updatedAt: record.updatedAt,
    ownerId: { displayName: "You" },
    isOwner: true,
    offline: true,
    tracks: record.tracks || [],
  };
}

export async function getOfflineLikedSongs(userId) {
  if (!userId) return null;
  const record = await getOfflinePlaylist(`liked:${userId}`);
  return record?.tracks?.map((entry) => entry.track) || null;
}

export async function saveLikedSongsOffline(userId, tracks, onProgress = () => {}) {
  if (!userId) throw new Error("Could not identify the signed-in user for offline storage.");
  return savePlaylistOffline({
    _id: `liked:${userId}`,
    name: "Liked Songs",
    visibility: "private",
    tracks: tracks.map((track, position) => ({ position, trackId: track._id, track })),
  }, onProgress);
}

export function removeLikedSongsOffline(userId) {
  if (!userId) return Promise.reject(new Error("Could not identify the signed-in user."));
  return removePlaylistOffline(`liked:${userId}`);
}

export async function savePlaylistOffline(playlist, onProgress = () => {}) {
  const playlistId = playlist?._id || playlist?.id;
  if (!playlistId) throw new Error("Playlist ID is missing.");
  const tracks = playlist.tracks || [];
  if (!tracks.length) throw new Error("Add songs to this playlist before downloading it.");

  let availableBytes = DEFAULT_AVAILABLE_BYTES;
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    if (Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage)) {
      availableBytes = Math.max(0, estimate.quota - estimate.usage);
    }
  }
  const byteBudget = Math.min(availableBytes, MAX_PLAYLIST_BYTES);
  let downloadedBytes = 0;
  const savedTrackIds = [];
  const savedTracks = [];
  const failures = [];

  for (const [index, entry] of tracks.entries()) {
    const track = entry.track || entry;
    const trackId = track._id;
    try {
      const existingBlob = await getOfflineTrackBlob(trackId);
      if (existingBlob) {
        savedTrackIds.push(trackId);
        savedTracks.push({ position: index, trackId, track: offlineTrackData(track) });
        onProgress({ completed: index + 1, total: tracks.length, track: track.title });
        continue;
      }
      if (!track.audioUrl) throw new Error("Audio file is unavailable for offline playback.");

      const response = await fetch(track.audioUrl, { credentials: "omit" });
      if (!response.ok) throw new Error(`Audio download failed (${response.status}).`);
      const remainingBytes = byteBudget - downloadedBytes;
      if (remainingBytes <= 0) throw new Error("The browser's available offline storage is full.");
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > remainingBytes) {
        throw new Error("This playlist exceeds the available offline storage.");
      }
      const blob = await readBlob(response, remainingBytes);
      await putRecord(TRACK_STORE, {
        id: trackId,
        blob,
        title: track.title,
        artist: track.artist,
        artworkUrl: track.image || track.artworkUrl || "",
        durationSeconds: track.durationSeconds || 0,
        savedAt: Date.now(),
      });
      downloadedBytes += blob.size;
      savedTrackIds.push(trackId);
      savedTracks.push({ position: index, trackId, track: offlineTrackData(track) });
    } catch (error) {
      failures.push({ title: track.title, message: error.message || "Download failed." });
    }
    onProgress({ completed: index + 1, total: tracks.length, track: track.title });
  }

  await putRecord(PLAYLIST_STORE, {
    id: playlistId,
    name: playlist.name,
    description: playlist.description || "",
    artworkUrl: playlist.artworkUrl || "",
    visibility: playlist.visibility || "private",
    updatedAt: playlist.updatedAt,
    trackIds: savedTrackIds,
    tracks: savedTracks,
    savedAt: Date.now(),
    complete: failures.length === 0 && savedTrackIds.length === tracks.length,
  });

  return { downloaded: savedTrackIds.length, total: tracks.length, failures };
}

function offlineTrackData(track) {
  return {
    ...track,
    audioUrl: "",
    image: track.image || track.artworkUrl || "",
  };
}

export async function removePlaylistOffline(playlistId) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([TRACK_STORE, PLAYLIST_STORE], "readwrite");
    const done = transactionDone(transaction);
    const trackStore = transaction.objectStore(TRACK_STORE);
    const playlistStore = transaction.objectStore(PLAYLIST_STORE);
    const [download, playlists] = await Promise.all([
      requestValue(playlistStore.get(playlistId)),
      requestValue(playlistStore.getAll()),
    ]);
    playlistStore.delete(playlistId);
    const sharedTrackIds = new Set(
      playlists
        .filter((playlist) => playlist.id !== playlistId)
        .flatMap((playlist) => playlist.trackIds || []),
    );
    for (const trackId of download?.trackIds || []) {
      if (!sharedTrackIds.has(trackId)) trackStore.delete(trackId);
    }
    await done;
  } finally {
    database.close();
  }
}
