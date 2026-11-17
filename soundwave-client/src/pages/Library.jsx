import { useEffect, useState } from "react";
import { ChevronRight, Music2, Plus, Trash2 } from "lucide-react";
import Header from "../components/Header";
import TrackRow from "../components/TrackRow";
import { deletePlaylist, getLikedTracks, getPlaylists } from "../api";

export default function Library({ item, onNavigate, onPlay }) {
  const [showLikedSongs, setShowLikedSongs] = useState(Boolean(item?.showLikedSongs));
  const [likedTracks, setLikedTracks] = useState(null);
  const [likedError, setLikedError] = useState("");
  const [playlists, setPlaylists] = useState(null);
  const [playlistsError, setPlaylistsError] = useState("");
  const [deletingPlaylistId, setDeletingPlaylistId] = useState("");

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

  function openLikedSongs() {
    setLikedTracks(null);
    setLikedError("");
    setShowLikedSongs(true);
  }

  async function removePlaylist(playlist) {
    if (!window.confirm(`Delete “${playlist.name}” and remove it from your library?`)) return;
    setPlaylistsError("");
    setDeletingPlaylistId(playlist._id);
    try {
      await deletePlaylist(playlist._id);
      setPlaylists((current) => current.filter((entry) => entry._id !== playlist._id));
    } catch (error) {
      setPlaylistsError(error.message || "Could not delete this playlist.");
    } finally {
      setDeletingPlaylistId("");
    }
  }

  useEffect(() => {
    if (!showLikedSongs) return undefined;
    let active = true;
    getLikedTracks()
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
  }, [showLikedSongs]);

  if (showLikedSongs) {
    return (
      <div className="page">
        <Header title="Liked Songs" onBack={() => setShowLikedSongs(false)} />
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
        <button className="library-item" onClick={openLikedSongs}>
          <span className="playlist-cover playlist-cover--liked"><Music2 size={21} /></span>
          <span><strong>Liked Songs</strong><small>Your saved tracks</small></span>
          <ChevronRight size={20} />
        </button>
        {playlistsError && <p className="playlist-error" role="alert">Could not load playlists: {playlistsError}</p>}
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
                <small>{playlist.trackCount} {playlist.trackCount === 1 ? "song" : "songs"} · {playlist.visibility}</small>
              </span>
              <ChevronRight size={20} />
            </button>
            <button
              className="icon-button library-playlist-delete"
              aria-label={`Delete ${playlist.name}`}
              title={`Delete ${playlist.name}`}
              disabled={Boolean(deletingPlaylistId)}
              onClick={() => removePlaylist(playlist)}
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
        {playlists?.length === 0 && <p className="empty-state">Your playlists will appear here.</p>}
      </div>
      <button className="library-ai-link" onClick={() => onNavigate("AIPlaylistGenerator")}>✦ Try the AI Playlist Generator <ChevronRight size={18} /></button>
    </div>
  );
}
