import { useEffect, useMemo, useState } from "react";
import SearchBar from "../components/SearchBar";
import TrackRow from "../components/TrackRow";
import { getPublishedTracks } from "../api";

export default function Search({ onPlay }) {
	const [query, setQuery] = useState("");
	const [songs, setSongs] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		getPublishedTracks({ limit: 50 })
			.then((tracks) => {
				if (active) setSongs(tracks);
			})
			.catch((requestError) => {
				if (active) setError(requestError.message);
			})
			.finally(() => {
				if (active) setLoading(false);
			});

		return () => {
			active = false;
		};
	}, []);

	const results = useMemo(() => {
		const term = query.trim().toLowerCase();
		if (!term) return songs;
		return songs.filter((song) =>
			`${song.title} ${song.artist} ${song.genre || ""} ${song.albumId?.title || ""}`
				.toLowerCase()
				.includes(term),
		);
	}, [query, songs]);

	return (
		<div className="page">
			<header className="page-title-row"><h1>Search</h1></header>
			<SearchBar value={query} onChange={setQuery} placeholder="Search songs, artists, albums..." />
			<div className="filter-pills">{["All", "Playlists", "Artists", "Albums", "Songs"].map((item, index) => <button key={item} className={`filter-pill ${index === 0 ? "is-selected" : ""}`}>{item}</button>)}</div>
			<h2 className="subheading">{query ? "Search results" : "Published songs"}</h2>
			{loading && <p className="empty-state">Loading the catalog...</p>}
			{!loading && error && <p className="empty-state">Catalog unavailable: {error}</p>}
			{!loading && !error && results.map((song) => <TrackRow key={song._id} track={song} onPlay={onPlay} />)}
			{!loading && !error && !results.length && <p className="empty-state">{songs.length ? "No matches found. Try another search." : "No published songs yet."}</p>}
		</div>
	);
}
