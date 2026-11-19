import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { BottomNav } from "./BottomNav";
import { PlaybackContext } from "./PlaybackContext";
import { getOfflineTrackBlob } from "../offline";

export default function AppLayout({
    children,
    activePage,
    onNavigate,
    currentTrack,
    hasActiveTrack,
    playRequest,
    onPlaybackStart,
    onPlaybackProgress,
    onTrackEnded,
}) {
    const audioRef = useRef(null);
    const playbackEventRef = useRef(null);
    const playbackSessionKeyRef = useRef("");
    const listenedSecondsRef = useRef(0);
    const previousAudioTimeRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [activeAudioSource, setActiveAudioSource] = useState("");
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

    const savePlaybackMetrics = useCallback(() => {
        const eventId = playbackEventRef.current;
        if (!eventId || !onPlaybackProgress) return;
        const audio = audioRef.current;
        const completionPercent = audio && Number.isFinite(audio.duration) && audio.duration > 0
            ? Math.min(100, (audio.currentTime / audio.duration) * 100)
            : 0;
        onPlaybackProgress(eventId, {
            secondsPlayed: listenedSecondsRef.current,
            completionPercent,
        }).catch((error) => {
            setHistoryError(`Could not update listening history: ${error.message}`);
        });
    }, [onPlaybackProgress]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        let active = true;
        let objectUrl;
        setActiveAudioSource("");

        async function startTrack() {
            let offlineBlob = null;
            if (currentTrack?._id) {
                try {
                    offlineBlob = await getOfflineTrackBlob(currentTrack._id);
                } catch {
                    offlineBlob = null;
                }
            }
            if (!active) return;

            const source = offlineBlob
                ? (objectUrl = URL.createObjectURL(offlineBlob))
                : currentTrack?.audioUrl;
            if (!source) {
                audio.pause();
                audio.removeAttribute("src");
                audio.load();
                return;
            }

            setPlaybackError("");
            setActiveAudioSource(source);
            audio.src = source;
            audio.load();
            audio.play().catch((error) => {
                setPlaybackError(`Audio could not be played: ${error.message}`);
            });
        }

        void startTrack();
        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            savePlaybackMetrics();
            playbackEventRef.current = null;
            playbackSessionKeyRef.current = "";
            listenedSecondsRef.current = 0;
            previousAudioTimeRef.current = null;
        };
    }, [currentTrack?._id, currentTrack?.audioUrl, playRequest, savePlaybackMetrics]);

    function togglePlayback() {
        const audio = audioRef.current;
        setPlaybackError("");
        if (!activeAudioSource || !audio) {
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
        if (audioRef.current && activeAudioSource) audioRef.current.currentTime = boundedTime;
    }

    function handleAudioPlay() {
        setPlaying(true);
        const sessionKey = playbackKey;
        previousAudioTimeRef.current = audioRef.current?.currentTime ?? null;
        if (
            !currentTrack?._id ||
            !onPlaybackStart ||
            playbackSessionKeyRef.current === sessionKey
        ) return;

        playbackSessionKeyRef.current = sessionKey;
        setHistoryError("");
        onPlaybackStart(currentTrack)
            .then((event) => {
                if (playbackSessionKeyRef.current !== sessionKey) return;
                playbackEventRef.current = event.id;
                if (listenedSecondsRef.current > 0) savePlaybackMetrics();
            })
            .catch((error) => {
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

    useEffect(() => {
        if (!playing) return undefined;
        const interval = window.setInterval(savePlaybackMetrics, 15_000);
        return () => window.clearInterval(interval);
    }, [playing, savePlaybackMetrics]);

    return (
        <main className="app-shell">
            <PlaybackContext.Provider value={playback}>
                <audio
                    className="persistent-audio"
                    ref={audioRef}
                    preload="metadata"
                    loop={repeating}
                    onPlay={handleAudioPlay}
                    onTimeUpdate={(event) => {
                        const audio = event.currentTarget;
                        const previousTime = previousAudioTimeRef.current;
                        if (previousTime !== null) {
                            const elapsed = audio.currentTime - previousTime;
                            if (elapsed > 0 && elapsed <= 2.5) listenedSecondsRef.current += elapsed;
                        }
                        previousAudioTimeRef.current = audio.currentTime;
                        setPlaybackProgress({
                            key: playbackKey,
                            currentTime: audio.currentTime,
                            duration,
                        });
                    }}
                    onPause={() => {
                        setPlaying(false);
                        savePlaybackMetrics();
                        previousAudioTimeRef.current = null;
                    }}
                    onLoadedMetadata={(event) => {
                        const audioDuration = event.currentTarget.duration;
                        if (Number.isFinite(audioDuration)) {
                            setPlaybackProgress({ key: playbackKey, currentTime, duration: audioDuration });
                        }
                    }}
                    onEnded={() => {
                        setPlaying(false);
                        savePlaybackMetrics();
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