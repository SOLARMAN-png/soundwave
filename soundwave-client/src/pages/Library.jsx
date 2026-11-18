import { useEffect, useState } from "react";
import { ChevronRight, Download, MoreVertical, Music2, Plus, Share2, Trash2 } from "lucide-react";
import Header from "../components/Header";
import TrackRow from "../components/TrackRow";
import {
  clearLikedTracks,
  createLikedTracksSharePlaylist,
  deletePlaylist,
  getAllLikedTracks,
  getCurrentUser,
  getPlaylist,
  getPlaylists,
  updatePlaylist,
} from "../api";
import {
  getOfflinePlaylist,
  removeLikedSongsOffline,
  removePlaylistOffline,
  saveLikedSongsOffline,
  savePlaylistOffline,
} from "../offline";

export default function Library({ item, onNavigate, onPlay }) {
  const [showLikedSongs, setShowLikedSongs] = useState(Boolean(item?.showLikedSongs));
  const [likedTracks, setLikedTracks] = useState(null);
  const [likedError, setLikedError] = useState("");
  const [playlists, setPlaylists] = useState(null);
  const [playlistsError, setPlaylistsError] = useState("");
  const [deletingPlaylistId, setDeletingPlaylistId] = useState("");
  const [activeMenuId, setActiveMenuId] = useState("");
  const [offlineDownloads, setOfflineDownloads] = useState({});
  const [downloadProgress, setDownloadProgress] = useState({});
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [likedUserId, setLikedUserId] = useState("");
  const [likedOfflineDownload, setLikedOfflineDownload] = useState(null);
  const [likedDownloadProgress, setLikedDownloadProgress] = useState(null);
  const [likedActionMessage, setLikedActionMessage] = useState("");
  const [likedActionError, setLikedActionError] = useState("");

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((user) => {
        if (active) setLikedUserId(user.id);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getPlaylists()
      .then((result) => {
        if (active) setPlaylists(result);
      })
      .catch((error) => {
        if (active) setPlaylistsError(error.message || "Playlists are unavailable.");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!playlists) return undefined;
    let active = true;
    Promise.all(playlists.map(async (playlist) => {
      try {
        return [playlist._id, await getOfflinePlaylist(playlist._id)];
      } catch {
        return [playlist._id, null];
      }
    })).then((entries) => {
      if (active) setOfflineDownloads(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [playlists]);

  useEffect(() => {
    if (!likedUserId) return undefined;
    let active = true;
    getOfflinePlaylist(`liked:${likedUserId}`)
      .then((record) => {
        if (active) setLikedOfflineDownload(record);
      })
      .catch(() => {
        if (active) setLikedOfflineDownload(null);
      });
    return () => {
      active = false;
    };
  }, [likedUserId]);

  function openLikedSongs() {
    setLikedTracks(null);
    setLikedError("");
    setShowLikedSongs(true);
  }

  async function removePlaylist(playlist) {
    if (!window.confirm(`Delete “${playlist.name}” and remove it from your library?`)) return;
    setActionError("");
    setActionMessage("");
    setDeletingPlaylistId(playlist._id);
    try {
      await deletePlaylist(playlist._id);
      setPlaylists((current) => current.filter((entry) => entry._id !== playlist._id));
      await removePlaylistOffline(playlist._id).catch(() => {});
      setActiveMenuId("");
    } catch (error) {
      setActionError(error.message || "Could not delete this playlist.");
    } finally {
      setDeletingPlaylistId("");
    }
  }

  async function sharePlaylist(playlist) {
    setActionError("");
    setActionMessage("");
    setActiveMenuId("");
    try {
      if (playlist.visibility !== "public") {
        const makePublic = window.confirm(
          `“${playlist.name}” is private. Make it public so anyone with the link can listen?`,
        );
        if (!makePublic) return;
        await updatePlaylist(playlist._id, { visibility: "public" });
        setPlaylists((current) => current.map((entry) =>
          entry._id === playlist._id ? { ...entry, visibility: "public" } : entry,
        ));
      }

      const url = new URL(`/playlists/${encodeURIComponent(playlist._id)}`, window.location.origin).toString();
      if (navigator.share) {
        await navigator.share({ title: playlist.name, text: `Listen to ${playlist.name} on SoundWave`, url });
        setActionMessage("Playlist link shared.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setActionMessage("Playlist link copied to clipboard.");
      } else {
        setActionMessage(`Share this playlist link: ${url}`);
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      setActionError(error.message || "Could not share this playlist.");
    }
  }

  async function toggleOfflineDownload(playlist) {
    setActionError("");
    setActionMessage("");
    if (downloadProgress[playlist._id]) return;

    const savedDownload = offlineDownloads[playlist._id];
    const savedDownloadIsCurrent = savedDownload?.complete &&
      (!playlist.updatedAt || savedDownload.updatedAt === playlist.updatedAt);
    if (savedDownloadIsCurrent) {
      try {
        await removePlaylistOffline(playlist._id);
        setOfflineDownloads((current) => ({ ...current, [playlist._id]: null }));
        setActionMessage(`Offline download removed for “${playlist.name}”.`);
        setActiveMenuId("");
      } catch (error) {
        setActionError(error.message || "Could not remove the offline download.");
      }
      return;
    }

    if (savedDownload) {
      await removePlaylistOffline(playlist._id).catch(() => {});
      setOfflineDownloads((current) => ({ ...current, [playlist._id]: null }));
    }

    setDownloadProgress((current) => ({ ...current, [playlist._id]: { completed: 0, total: 0 } }));
    try {
      const details = await getPlaylist(playlist._id);
      const result = await savePlaylistOffline(details, (progress) => {
        setDownloadProgress((current) => ({ ...current, [playlist._id]: progress }));
      });
      const record = await getOfflinePlaylist(playlist._id);
      setOfflineDownloads((current) => ({ ...current, [playlist._id]: record }));
      setActionMessage(result.failures.length
        ? `Saved ${result.downloaded} of ${result.total} tracks offline. ${result.failures[0]?.message || "Some tracks could not be saved."}`
        : `“${playlist.name}” is ready for offline playback.`);
      setActiveMenuId("");
    } catch (error) {
      setActionError(error.message || "Could not download this playlist.");
    } finally {
      setDownloadProgress((current) => {
        const next = { ...current };
        delete next[playlist._id];
        return next;
      });
    }
  }

  async function shareLikedSongs() {
    setActiveMenuId("");
    setLikedActionError("");
    setLikedActionMessage("");
    if (!window.confirm("Create a public snapshot playlist from your current liked songs? It will not sync with future likes.")) return;
    try {
      const sharedPlaylist = await createLikedTracksSharePlaylist();
      const playlist = {
        _id: sharedPlaylist.id,
        name: sharedPlaylist.name,
        visibility: "public",
        trackCount: sharedPlaylist.trackCount,
      };
      setPlaylists((current) => [playlist, ...(current || []).filter((entry) => entry._id !== playlist._id)]);
      const url = new URL(`/playlists/${encodeURIComponent(sharedPlaylist.id)}`, window.location.origin).toString();
      if (navigator.share) {
        await navigator.share({ title: sharedPlaylist.name, text: "A snapshot of my liked songs on SoundWave", url });
        setLikedActionMessage("Liked songs snapshot shared.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setLikedActionMessage("Snapshot playlist link copied to clipboard.");
      } else {
        setLikedActionMessage(`Share this snapshot link: ${url}`);
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      setLikedActionError(error.message || "Could not share liked songs.");
    }
  }

  async function toggleLikedSongsOffline() {
    if (!likedUserId || likedDownloadProgress) return;
    setLikedActionError("");
    setLikedActionMessage("");
    if (likedOfflineDownload?.complete) {
      try {
        await removeLikedSongsOffline(likedUserId);
        setLikedOfflineDownload(null);
        setLikedActionMessage("Liked songs offline download removed.");
        setActiveMenuId("");
      } catch (error) {
        setLikedActionError(error.message || "Could not remove the offline download.");
      }
      return;
    }

    if (likedOfflineDownload) await removeLikedSongsOffline(likedUserId).catch(() => {});
    setLikedDownloadProgress({ completed: 0, total: 0 });
    try {
      const tracks = await getAllLikedTracks({ userId: likedUserId });
      const result = await saveLikedSongsOffline(likedUserId, tracks, (progress) => {
        setLikedDownloadProgress(progress);
      });
      const record = await getOfflinePlaylist(`liked:${likedUserId}`);
      setLikedOfflineDownload(record);
      setLikedActionMessage(result.failures.length
        ? `Saved ${result.downloaded} of ${result.total} liked songs offline. ${result.failures[0]?.message || "Some tracks could not be saved."}`
        : "Liked songs are ready for offline playback.");
      setActiveMenuId("");
    } catch (error) {
      setLikedActionError(error.message || "Could not download liked songs.");
    } finally {
      setLikedDownloadProgress(null);
    }
  }

  async function deleteLikedSongs() {
    if (!window.confirm("Remove all tracks from Liked Songs? This will not delete playlists or shared snapshots.")) return;
    setLikedActionError("");
    setLikedActionMessage("");
    try {
      await clearLikedTracks();
      setLikedTracks([]);
      if (likedUserId) {
        await removeLikedSongsOffline(likedUserId).catch(() => {});
        setLikedOfflineDownload(null);
      }
      setActiveMenuId("");
      setLikedActionMessage("Liked songs cleared.");
    } catch (error) {
      setLikedActionError(error.message || "Could not clear liked songs.");
    }
  }

  useEffect(() => {
    if (!showLikedSongs) return undefined;
    let active = true;
    getAllLikedTracks({ userId: likedUserId })
      .then((tracks) => {
        if (active) setLikedTracks(tracks);
      })
      .catch((error) => {
        if (active) setLikedError(error.status === 401
          ? "Sign in to view your liked songs."
          : `Liked songs are unavailable: ${error.message}`);
      });

    return () => {
      active = false;
    };
  }, [showLikedSongs, likedUserId]);

  if (showLikedSongs) {
    return (
      <div className="page">
        <Header title="Liked Songs" onBack={() => setShowLikedSongs(false)} />
        {likedActionError && <p className="playlist-error" role="alert">{likedActionError}</p>}
        {likedActionMessage && <p className="playlist-status" role="status">{likedActionMessage}</p>}
        {likedTracks === null && !likedError && <p className="empty-state">Loading liked songs...</p>}
        {likedError && <p className="empty-state" role="alert">{likedError}</p>}
        {likedTracks && likedTracks.map((song, index) => (
          <TrackRow
            key={song._id}
            track={song}
            index={index + 1}
            onPlay={(selectedTrack) => onPlay(selectedTrack, { queue: likedTracks })}
          />
        ))}
        {likedTracks && !likedTracks.length && (
          <p className="empty-state">Songs you like will appear here.</p>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <Header title="Your Library" action={<button className="icon-button" onClick={() => onNavigate("CreatePlaylist")} aria-label="Create playlist"><Plus /></button>} />
      <div className="filter-pills">{["Playlists", "Artists", "Albums", "Songs"].map((item, index) => <button key={item} className={`filter-pill ${index === 0 ? "is-selected" : ""}`}>{item}</button>)}</div>
      <div className="library-list">
        <div className="library-playlist-row">
          <button className="library-item" onClick={openLikedSongs}>
            <span className="playlist-cover playlist-cover--liked"><Music2 size={21} /></span>
            <span>
              <strong>Liked Songs</strong>
              <small>Your saved tracks{likedOfflineDownload?.complete && <span className="playlist-offline-badge">Offline</span>}</small>
            </span>
            <ChevronRight size={20} />
          </button>
          <div className="library-playlist-options">
            <button
              className="icon-button library-playlist-menu-trigger"
              aria-label="Options for Liked Songs"
              aria-haspopup="menu"
              aria-expanded={activeMenuId === "liked-songs"}
              onClick={() => setActiveMenuId((current) => current === "liked-songs" ? "" : "liked-songs")}
            >
              <MoreVertical size={20} />
            </button>
            {activeMenuId === "liked-songs" && (
              <div className="playlist-options-menu" role="menu" aria-label="Liked Songs options">
                <button role="menuitem" onClick={shareLikedSongs}>
                  <Share2 size={16} /> Share snapshot
                </button>
                <button
                  role="menuitem"
                  disabled={!likedUserId || Boolean(likedDownloadProgress)}
                  onClick={toggleLikedSongsOffline}
                >
                  <Download size={16} />
                  {likedDownloadProgress
                    ? `Downloading ${likedDownloadProgress.completed}/${likedDownloadProgress.total || "..."}`
                    : likedOfflineDownload?.complete ? "Remove offline download" : "Download offline"}
                </button>
                <button role="menuitem" className="is-danger" onClick={deleteLikedSongs}>
                  <Trash2 size={16} /> Clear liked songs
                </button>
              </div>
            )}
          </div>
        </div>
        {likedActionError && <p className="playlist-error" role="alert">{likedActionError}</p>}
        {likedActionMessage && <p className="playlist-status" role="status">{likedActionMessage}</p>}
        {playlistsError && <p className="playlist-error" role="alert">Could not load playlists: {playlistsError}</p>}
        {actionError && <p className="playlist-error" role="alert">{actionError}</p>}
        {actionMessage && <p className="playlist-status" role="status">{actionMessage}</p>}
        {playlists === null && !playlistsError && <p className="empty-state">Loading playlists...</p>}
        {playlists?.map((playlist) => (
          <div className="library-playlist-row" key={playlist._id}>
            <button
              className="library-item"
              onClick={() => onNavigate("Playlist", playlist)}
            >
              {playlist.artworkUrl
                ? <img src={playlist.artworkUrl} alt="" />
                : <span className="playlist-cover"><Music2 size={21} /></span>}
              <span>
                <strong>{playlist.name}</strong>
                <small>
                  {playlist.trackCount} {playlist.trackCount === 1 ? "song" : "songs"} · {playlist.visibility}
                  {(offlineDownloads[playlist._id]?.complete && (!playlist.updatedAt || offlineDownloads[playlist._id].updatedAt === playlist.updatedAt) || playlist.offline) && <span className="playlist-offline-badge">Offline</span>}
                </small>
              </span>
              <ChevronRight size={20} />
            </button>
            <div className="library-playlist-options">
              <button
                className="icon-button library-playlist-menu-trigger"
                aria-label={`Options for ${playlist.name}`}
                aria-haspopup="menu"
                aria-expanded={activeMenuId === playlist._id}
                disabled={Boolean(deletingPlaylistId)}
                onClick={() => setActiveMenuId((current) => current === playlist._id ? "" : playlist._id)}
              >
                <MoreVertical size={20} />
              </button>
              {activeMenuId === playlist._id && (
                <div className="playlist-options-menu" role="menu" aria-label={`${playlist.name} options`}>
                  <button role="menuitem" onClick={() => sharePlaylist(playlist)}>
                    <Share2 size={16} /> Share playlist
                  </button>
                  <button role="menuitem" disabled={Boolean(downloadProgress[playlist._id])} onClick={() => toggleOfflineDownload(playlist)}>
                    <Download size={16} />
                    {downloadProgress[playlist._id]
                      ? `Downloading ${downloadProgress[playlist._id].completed}/${downloadProgress[playlist._id].total || "..."}`
                      : offlineDownloads[playlist._id]?.complete && (!playlist.updatedAt || offlineDownloads[playlist._id].updatedAt === playlist.updatedAt)
                        ? "Remove offline download"
                        : offlineDownloads[playlist._id] ? "Retry offline download" : "Download offline"}
                  </button>
                  <button role="menuitem" className="is-danger" onClick={() => removePlaylist(playlist)}>
                    <Trash2 size={16} /> Delete playlist
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {playlists?.length === 0 && <p className="empty-state">Your playlists will appear here.</p>}
      </div>
      <button className="library-ai-link" onClick={() => onNavigate("AIPlaylistGenerator")}>✦ Try the AI Playlist Generator <ChevronRight size={18} /></button>
    </div>
  );
}
