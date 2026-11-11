import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import SearchBar from "../components/SearchBar";
import MusicCard from "../components/MusicCard";
import SectionHeader from "../components/SectionHeader";
import TrackRow from "../components/TrackRow";
import { getCurrentUser, getPlaybackHistory, getPublishedAlbums, getPublishedTracks, getRecommendedTracks } from "../api";
const feature={title:"Chill Vibes",subtitle:"50 songs",image:"https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=85"};

function getTimeGreeting(date = new Date()) {
	const hour = date.getHours();
	if (hour < 12) return "Good morning,";
	if (hour < 17) return "Good afternoon,";
	return "Good evening,";
}

export default function Home({ onNavigate, onPlay }) {
	const [query, setQuery] = useState("");
	const [tracks, setTracks] = useState([]);
	const [albums, setAlbums] = useState([]);
	const [recommendedTracks, setRecommendedTracks] = useState([]);
	const [recommendationsLoading, setRecommendationsLoading] = useState(true);
	const [recommendationsError, setRecommendationsError] = useState("");
	const [recentTracks, setRecentTracks] = useState([]);
	const [historyError, setHistoryError] = useState("");
	const [displayName, setDisplayName] = useState("there");
	const [greeting, setGreeting] = useState(getTimeGreeting);

	useEffect(() => {
		let active = true;
		getCurrentUser()
			.then((user) => {
				if (active && user?.displayName?.trim()) {
					setDisplayName(user.displayName.trim().split(/\s+/)[0]);
				}
			})
			.catch(() => {
				if (active) setDisplayName("there");
			});

		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		const timer = setInterval(() => setGreeting(getTimeGreeting()), 60_000);
		return () => clearInterval(timer);
	}, []);

	useEffect(() => {
		let active = true;
		getPublishedTracks({ limit: 3 })
			.then((items) => {
				if (active) setTracks(items);
			})
			.catch(() => {
				if (active) setTracks([]);
			});

		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		let active = true;
		getPublishedAlbums({ limit: 3 })
			.then((items) => {
				if (active) setAlbums(items);
			})
			.catch(() => {
				if (active) setAlbums([]);
			});

		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		let active = true;
		getRecommendedTracks()
			.then((items) => {
				if (active) setRecommendedTracks(items);
			})
			.catch((error) => {
				if (active) {
					setRecommendedTracks([]);
					setRecommendationsError(error.status === 401
						? "Sign in and choose your favorite genres or artists to get recommendations."
						: "Personalized songs are unavailable right now.");
				}
			})
			.finally(() => {
				if (active) setRecommendationsLoading(false);
			});

		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		let active = true;
		getPlaybackHistory()
			.then((items) => {
				if (active) setRecentTracks(items);
			})
			.catch((error) => {
				if (active) {
					setHistoryError(error.status === 401
						? "Sign in to see your recently played songs."
						: "Recently played songs are unavailable right now.");
				}
			});

		return () => {
			active = false;
		};
	}, []);

	return (
		<div className="page page--home">
			<header className="home-greeting"><div><p>{greeting}</p><h1>{displayName}</h1></div><button className="avatar-button" aria-label="Profile"><img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=85" alt="Profile" /></button></header>
			<SearchBar value={query} onChange={setQuery} onSubmit={() => onNavigate("Search")} />
			<button className="hero-banner" onClick={() => onPlay(feature)}><img src={feature.image} alt="" /><span className="hero-banner__shade" /><span className="hero-banner__copy"><strong>Chill Vibes</strong><small>Relax · Unwind · Reconnect</small></span><span className="hero-banner__play"><Play size={19} fill="currentColor" /></span></button>
			{(tracks.length > 0 || albums.length > 0) && <section className="section-block"><SectionHeader title="Just added" onAction={() => onNavigate("Search")} />{tracks.length > 0 && <div className="published-tracks">{tracks.map((item) => <TrackRow key={item._id} track={item} onPlay={onPlay} />)}</div>}{albums.length > 0 && <div className="home-added-albums"><h3>Albums</h3><div className="home-added-albums__list">{albums.map((item) => <button className="home-added-album" key={item._id} onClick={() => onNavigate("Album", item)} aria-label={`Open ${item.title} by ${item.artist}`}><img src={item.image} alt="" loading="lazy" /><strong>{item.title}</strong><span>{item.artist}</span></button>)}</div></div>}</section>}
			<section className="section-block"><SectionHeader title="Made for You" onAction={() => onNavigate("Search")} /><div className="horizontal-cards">{recommendedTracks.map((item) => <MusicCard key={item._id} item={{ ...item, subtitle: item.artist, image: item.image || feature.image }} onClick={onPlay} />)}</div>{!recommendedTracks.length && <p className="empty-state">{recommendationsLoading ? "Finding songs for you..." : recommendationsError || "No published songs match your selections yet."}</p>}</section>
			<section className="section-block section-block--recent"><SectionHeader title="Recently Played" onAction={() => onNavigate("Library")} /><div className="horizontal-cards horizontal-cards--recent">{recentTracks.map((item) => <MusicCard key={item._id} item={item} variant="recent" onClick={onPlay} />)}</div>{!recentTracks.length && <p className="empty-state">{historyError || "Songs you play will appear here."}</p>}</section>
			<button className="vibe-promo" onClick={() => onNavigate("AIPlaylistGenerator")}><span className="vibe-promo__icon">✦</span><span><strong>Find your VibeMatch</strong><small>Music for how you feel right now</small></span><span className="vibe-promo__arrow">↗</span></button>
		</div>
	);
}
