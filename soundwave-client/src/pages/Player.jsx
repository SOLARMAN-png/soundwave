import { useEffect, useState } from "react";
import {
  ArrowDown,
  Heart,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Speaker,
  Volume2,
} from "lucide-react";
import { getLikedTracks, setTrackLiked } from "../api";
import { usePlayback } from "../components/PlaybackContext";

function formatTime(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export default function Player({
  track,
  queueName,
  canGoPrevious,
  canGoNext,
  onPreviousTrack,
  onNextTrack,
  onNavigate,
}) {
  const [likedTrackId, setLikedTrackId] = useState(null);
  const [likeBusy, setLikeBusy] = useState(false);
  const [shuffled, setShuffled] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const {
    playing,
    currentTime,
    duration,
    playbackError: audioError,
    historyError,
    togglePlayback,
    seekTo,
    repeating,
    setRepeating,
  } = usePlayback();
  const liked = track?._id === likedTrackId;

  useEffect(() => {
    let active = true;
    if (!track?._id) return () => {
      active = false;
    };

    getLikedTracks()
      .then((tracks) => {
        if (active) {
          setPlaybackError("");
          setLikedTrackId(tracks.some((likedTrack) => likedTrack._id === track._id) ? track._id : null);
        }
      })
      .catch((error) => {
        if (active) setPlaybackError(`Could not load liked songs: ${error.message}`);
      });

    return () => {
      active = false;
    };
  }, [track?._id]);

  function handleRepeat() {
    setRepeating((current) => !current);
  }

  async function toggleLiked() {
    if (!track?._id || likeBusy) {
      setPlaybackError("This song cannot be added to your liked songs.");
      return;
    }

    setLikeBusy(true);
    setPlaybackError("");
    try {
      await setTrackLiked(track._id, !liked);
      setLikedTrackId(liked ? null : track._id);
    } catch (error) {
      setPlaybackError(`Could not update liked songs: ${error.message}`);
    } finally {
      setLikeBusy(false);
    }
  }

  return (
    <div className="page player-page">
      <header className="player-header">
        <button className="icon-button" onClick={() => onNavigate("Home")} aria-label="Close player"><ArrowDown /></button>
        <div><small>NOW PLAYING</small><strong>{queueName || "SoundWave"}</strong></div>
        <button className="icon-button" aria-label="Audio settings"><SlidersHorizontal /></button>
      </header>
      <div className="player-artwork"><img src={track?.image || track?.artworkUrl || ""} alt="" /></div>
      <div className="player-track-heading">
        <div><h1>{track?.title || "Blinding Lights"}</h1><p>{track?.artist || "The Weeknd"}</p></div>
        <button className={`icon-button ${liked ? "is-liked" : ""}`} onClick={toggleLiked} disabled={likeBusy} aria-label={liked ? "Remove from liked songs" : "Add to liked songs"} aria-pressed={liked}><Heart fill={liked ? "currentColor" : "none"} /></button>
      </div>
      <input
        className="progress-slider"
        type="range"
        min="0"
        max={duration}
        step="0.1"
        value={Math.min(currentTime, duration)}
        onChange={(event) => seekTo(Number(event.target.value))}
        aria-label="Track progress"
      />
      <div className="time-labels"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
      {audioError && <p className="admin-alert" role="alert">{audioError}</p>}
      {playbackError && <p className="admin-alert" role="alert">{playbackError}</p>}
      {historyError && <p className="admin-alert" role="alert">{historyError}</p>}
      <div className="player-controls">
        <button className={`icon-button ${shuffled ? "is-active" : ""}`} onClick={() => setShuffled(!shuffled)} aria-label="Shuffle" aria-pressed={shuffled}><Shuffle /></button>
        <button className="icon-button" onClick={onPreviousTrack} disabled={!canGoPrevious} aria-label="Play previous song"><SkipBack /></button>
        <button className="main-play" onClick={togglePlayback} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>
        <button className="icon-button" onClick={() => onNextTrack(shuffled)} disabled={!canGoNext} aria-label="Play next song"><SkipForward /></button>
        <button className={`icon-button ${repeating ? "is-active" : ""}`} onClick={handleRepeat} aria-label="Repeat" aria-pressed={repeating}><Repeat /></button>
      </div>
      <div className="player-footer">
        <button className="icon-button" aria-label="Devices"><Speaker /></button>
        <span><Volume2 size={16} /> Devices Available</span>
        <button className="icon-button" aria-label="Queue"><ListMusic /></button>
      </div>
    </div>
  );
}
