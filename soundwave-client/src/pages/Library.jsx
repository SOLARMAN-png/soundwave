import { useEffect, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import Header from "../components/Header";
import TrackRow from "../components/TrackRow";
import { getLikedTracks } from "../api";

const items = [
  ["Liked Songs", "liked", "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=200&q=80"],
  ["My Playlist 1", "32 songs", "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=200&q=80"],
  ["Chill Vibes", "50 songs", "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=200&q=80"],
  ["Workout Mix", "87 songs", "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=200&q=80"],
  ["Road Trip", "42 songs", "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=200&q=80"],
  ["Focus Flow", "36 songs", "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=200&q=80"],
];

export default function Library({ item, onNavigate, onPlay }) {
  const [showLikedSongs, setShowLikedSongs] = useState(Boolean(item?.showLikedSongs));
  const [likedTracks, setLikedTracks] = useState(null);
  const [likedError, setLikedError] = useState("");

  function openLikedSongs() {
    setLikedTracks(null);
    setLikedError("");
    setShowLikedSongs(true);
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
      <div className="library-list">{items.map(([title, subtitle, image]) => (
        <button className="library-item" key={title} onClick={() => {
          if (title === "Liked Songs") openLikedSongs();
          else if (title === "Chill Vibes") onNavigate("Playlist", { title, image, subtitle });
          else onPlay({ title, subtitle, image });
        }}>
          <img src={image} alt="" />
          <span><strong>{title}</strong><small>{subtitle === "liked" ? "Liked songs" : subtitle}</small></span>
          <ChevronRight size={20} />
        </button>
      ))}</div>
      <button className="library-ai-link" onClick={() => onNavigate("AIPlaylistGenerator")}>✦ Try the AI Playlist Generator <ChevronRight size={18} /></button>
    </div>
  );
}
