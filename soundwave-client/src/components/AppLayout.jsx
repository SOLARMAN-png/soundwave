import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { BottomNav } from "./BottomNav";
import { PlaybackContext } from "./PlaybackContext";

export default function AppLayout({
    children,
    activePage,
    onNavigate,
    currentTrack,
    hasActiveTrack,
    playRequest,
    onPlaybackStart,
    onTrackEnded,
}) {
    const audioRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [repeating, setRepeating] = useState(false);
    const [playbackProgress, setPlaybackProgress] = useState({
        key: "",
        currentTime: 0,
        duration: 200,
    });
    const [playbackError, setPlaybackError] = useState("");
    const [historyError, setHistoryError] = useState("");
    const playbackKey = `${currentTrack?._id || currentTrack?.audioUrl || currentTrack?.title}:${playRequest}`;
    const currentTime = playbackProgress.key === playbackKey ? playbackProgress.currentTime : 0;
    const duration = playbackProgress.key === playbackKey ? playbackProgress.duration : 200;

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        if (!currentTrack?.audioUrl) {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
            return;
        }

        audio.src = currentTrack.audioUrl;
        audio.load();
        audio.play().catch((error) => {
            setPlaybackError(`Audio could not be played: ${error.message}`);
        });
    }, [currentTrack?.audioUrl, playRequest]);

    function togglePlayback() {
        const audio = audioRef.current;
        setPlaybackError("");
        if (!currentTrack?.audioUrl || !audio) {
            setPlaying((isPlaying) => !isPlaying);
        } else if (audio.paused) {
            audio.play().catch((error) => {
                setPlaybackError(`Audio could not be played: ${error.message}`);
            });
        } else {
            audio.pause();
        }
    }

    function seekTo(time) {
        const boundedTime = Math.min(Math.max(time, 0), duration);
        setPlaybackProgress({ key: playbackKey, currentTime: boundedTime, duration });
        if (audioRef.current && currentTrack?.audioUrl) audioRef.current.currentTime = boundedTime;
    }

    function handleAudioPlay() {
        setPlaying(true);
        if (!currentTrack?._id || !onPlaybackStart) return;

        setHistoryError("");
        onPlaybackStart(currentTrack).catch((error) => {
            setHistoryError(`Could not save listening history: ${error.message}`);
        });
    }

    const playback = {
        playing,
        currentTime,
        duration,
        playbackError,
        historyError,
        togglePlayback,
        seekTo,
        repeating,
        setRepeating,
    };

    return (
        <main className="app-shell">
            <PlaybackContext.Provider value={playback}>
                <audio
                    className="persistent-audio"
                    ref={audioRef}
                    preload="metadata"
                    loop={repeating}
                    onPlay={handleAudioPlay}
                    onPause={() => setPlaying(false)}
                    onTimeUpdate={(event) => setPlaybackProgress({
                        key: playbackKey,
                        currentTime: event.currentTarget.currentTime,
                        duration,
                    })}
                    onLoadedMetadata={(event) => {
                        const audioDuration = event.currentTarget.duration;
                        if (Number.isFinite(audioDuration)) {
                            setPlaybackProgress({ key: playbackKey, currentTime, duration: audioDuration });
                        }
                    }}
                    onEnded={() => {
                        setPlaying(false);
                        onTrackEnded();
                    }}
                />
                <div className="app-content">{children}</div>
                {hasActiveTrack && activePage !== "Player" && (
                    <div className="mini-player">
                        <button className="mini-player__track" onClick={() => onNavigate("Player")} aria-label={`Open now playing: ${currentTrack.title}`}>
                            <img src={currentTrack.image || currentTrack.artworkUrl || ""} alt="" />
                            <span className="mini-player__details">
                                <strong>{currentTrack.title}</strong>
                                <span>{currentTrack.artist}</span>
                            </span>
                        </button>
                        <button
                            className="icon-button"
                            onClick={togglePlayback}
                            aria-label={playing ? "Pause playback" : "Resume playback"}
                        >
                            {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
                        </button>
                    </div>
                )}
                <BottomNav activePage={activePage} onNavigate={onNavigate} />
            </PlaybackContext.Provider>
        </main>
    );
}