import { useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import Welcome from "./pages/Welcome";
import Home from "./pages/Home";
import AlbumPage from "./pages/AlbumPage";
import Search from "./pages/Search";
import Playlist from "./pages/Playlist";
import Artist from "./pages/Artist";
import Player from "./pages/Player";
import Library from "./pages/Library";
import CreatePlaylist from "./pages/CreatePlaylist";
import AIPlaylistGenerator from "./pages/AIPlaylistGenerator";
import AdminDashboard from "./pages/AdminDashboard";
import AuthPage from "./pages/AuthPage";
import Onboarding from "./pages/Onboarding";
import VerifyEmail from "./pages/VerifyEmail";
import { getPublishedTracks, recordPlayback } from "./api";

const track = { title: "Blinding Lights", artist: "The Weeknd", image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=85" };
const pagePaths = {
  Welcome: "/welcome",
  Login: "/login",
  Signup: "/signup",
  Home: "/home",
  Search: "/search",
  Playlist: "/playlist",
  Artist: "/artist",
  Player: "/player",
  Library: "/library",
  CreatePlaylist: "/create-playlist",
  AIPlaylistGenerator: "/ai-playlist-generator",
};
const pagesByPath = Object.fromEntries(Object.entries(pagePaths).map(([page, path]) => [path, page]));

export default function App() {
  const [currentTrack, setCurrentTrack] = useState(track);
  const [availableTracks, setAvailableTracks] = useState([]);
  const [playbackHistory, setPlaybackHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [activeQueue, setActiveQueue] = useState(null);
  const [hasActiveTrack, setHasActiveTrack] = useState(false);
  const [playRequest, setPlayRequest] = useState(0);
  const location = useLocation();
  const routerNavigate = useNavigate();
  const activePage = pagesByPath[location.pathname] || "Home";
  const item = location.state?.item ?? null;

  useEffect(() => {
    let active = true;
    getPublishedTracks({ limit: 50 })
      .then((tracks) => {
        if (active) setAvailableTracks(tracks);
      })
      .catch((error) => {
        console.error("Could not load tracks for playback:", error);
      });

    return () => {
      active = false;
    };
  }, []);

  const navigate = (page, selected = null) => {
    if (page === "Album" && selected?._id) {
      routerNavigate(`/albums/${encodeURIComponent(selected._id)}`, { state: { item: selected } });
      return;
    }
    const path = pagePaths[page];
    if (!path) throw new Error(`Unknown page: ${page}`);
    routerNavigate(path, selected ? { state: { item: selected } } : undefined);
  };
  const sameTrack = (first, second) =>
    first?._id && second?._id
      ? first._id === second._id
      : first?.audioUrl === second?.audioUrl &&
        first?.title === second?.title &&
        first?.artist === second?.artist;

  const selectTrack = (selected, { addToHistory = true } = {}) => {
    const selectedTrack = {
      ...selected,
      title: selected?.title || track.title,
      artist: selected?.artist || selected?.subtitle || track.artist,
      image: selected?.image || track.image,
      audioUrl: selected?.audioUrl,
    };
    setHasActiveTrack(true);
    setCurrentTrack(selectedTrack);
    setPlayRequest((request) => request + 1);
    if (addToHistory) {
      const nextHistory = playbackHistory.slice(0, historyIndex + 1);
      if (!sameTrack(nextHistory[historyIndex], selectedTrack)) {
        nextHistory.push(selectedTrack);
        setPlaybackHistory(nextHistory);
        setHistoryIndex(nextHistory.length - 1);
      }
    }
    routerNavigate(pagePaths.Player);
  };

  const play = (selected, options = {}) => {
    if (options.queue?.length) {
      const queueIndex = options.queue.findIndex((queuedTrack) => sameTrack(queuedTrack, selected));
      setActiveQueue({ tracks: options.queue, index: queueIndex, name: "Liked Songs" });
    } else {
      setActiveQueue(null);
    }
    selectTrack(selected);
  };
  const playPrevious = () => {
    if (activeQueue) {
      if (activeQueue.index <= 0) return;
      const previousIndex = activeQueue.index - 1;
      setActiveQueue({ ...activeQueue, index: previousIndex });
      selectTrack(activeQueue.tracks[previousIndex]);
      return;
    }
    if (historyIndex <= 0) return;
    const previousIndex = historyIndex - 1;
    setHistoryIndex(previousIndex);
    selectTrack(playbackHistory[previousIndex], { addToHistory: false });
  };
  const playNext = (shuffle = false) => {
    if (activeQueue) {
      const { tracks, index } = activeQueue;
      if (index < 0 || index >= tracks.length - 1) return;

      const nextIndex = shuffle
        ? index + 1 + Math.floor(Math.random() * (tracks.length - index - 1))
        : index + 1;
      setActiveQueue({ ...activeQueue, index: nextIndex });
      selectTrack(tracks[nextIndex]);
      return;
    }
    if (historyIndex < playbackHistory.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      selectTrack(playbackHistory[nextIndex], { addToHistory: false });
      return;
    }

    const candidates = availableTracks.filter((candidate) => !sameTrack(candidate, currentTrack));
    if (!candidates.length) return;

    let nextTrack;
    if (shuffle) {
      nextTrack = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      const currentIndex = availableTracks.findIndex((candidate) => sameTrack(candidate, currentTrack));
      nextTrack = availableTracks[(currentIndex + 1 + availableTracks.length) % availableTracks.length];
    }
    selectTrack(nextTrack);
  };

  return (
    <Routes>
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/welcome" element={<Welcome onNavigate={navigate} />} />
      <Route path={pagePaths.Login} element={<AuthPage mode="login" />} />
      <Route path={pagePaths.Signup} element={<AuthPage mode="signup" />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route
        element={
          <AppLayout
            activePage={activePage}
            onNavigate={navigate}
            currentTrack={currentTrack}
            hasActiveTrack={hasActiveTrack}
            playRequest={playRequest}
            onPlaybackStart={(playedTrack) => recordPlayback(playedTrack._id)}
            onTrackEnded={() => playNext(false)}
          >
            <Outlet />
          </AppLayout>
        }
      >
        <Route path="/" element={<Navigate to={pagePaths.Home} replace />} />
        <Route path={pagePaths.Home} element={<Home onNavigate={navigate} onPlay={play} />} />
        <Route path="/albums/:id" element={<AlbumPage onNavigate={navigate} onPlay={play} />} />
        <Route path={pagePaths.Search} element={<Search onPlay={play} />} />
        <Route path={pagePaths.Playlist} element={<Playlist item={item} onNavigate={navigate} onPlay={play} />} />
        <Route path={pagePaths.Artist} element={<Artist item={item} onNavigate={navigate} onPlay={play} />} />
        <Route path={pagePaths.Player} element={<Player track={currentTrack} playRequest={playRequest} queueName={activeQueue?.name} canGoPrevious={activeQueue ? activeQueue.index > 0 : historyIndex > 0} canGoNext={activeQueue ? activeQueue.index >= 0 && activeQueue.index < activeQueue.tracks.length - 1 : availableTracks.some((candidate) => !sameTrack(candidate, currentTrack)) || historyIndex < playbackHistory.length - 1} onPreviousTrack={playPrevious} onNextTrack={playNext} onNavigate={activeQueue ? () => navigate("Library", { showLikedSongs: true }) : navigate} />} />
        <Route path={pagePaths.Library} element={<Library item={item} onNavigate={navigate} onPlay={play} />} />
        <Route path={pagePaths.CreatePlaylist} element={<CreatePlaylist onNavigate={navigate} />} />
        <Route path={pagePaths.AIPlaylistGenerator} element={<AIPlaylistGenerator onNavigate={navigate} />} />
      </Route>
      <Route path="*" element={<Navigate to={pagePaths.Home} replace />} />
    </Routes>
  );
}
