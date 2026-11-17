import { useEffect, useState } from "react";
import { Check, Lock, Music2, Play, Plus, Search as SearchIcon } from "lucide-react";
import { useParams } from "react-router-dom";
import Header from "../components/Header";
import TrackRow from "../components/TrackRow";
import { addTrackToPlaylist, getPlaylist, getPublishedTracks, removeTrackFromPlaylist } from "../api";

function formatDuration(seconds) {
	const totalMinutes = Math.floor(seconds / 60);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return hours ? `${hours} hr ${minutes} min` : `${minutes} min`;
}

export default function Playlist({ onNavigate, onPlay }) {
	const { id } = useParams();
	const [playlist, setPlaylist] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [showAddTracks, setShowAddTracks] = useState(false);
	const [catalog, setCatalog] = useState(null);
	const [catalogError, setCatalogError] = useState("");
	const [query, setQuery] = useState("");
	const [addingTrackId, setAddingTrackId] = useState("");
	const [removingTrackId, setRemovingTrackId] = useState("");
	const [trackActionError, setTrackActionError] = useState("");

	useEffect(() => {
		let active = true;
		setLoading(true);
		setError("");
		getPlaylist(id)
			.then((result) => {
				if (active) setPlaylist(result);
			})
			.catch((requestError) => {
				if (active) setError(requestError.message || "Could not load this playlist.");
			})
			.finally(() => {
				if (active) setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [id]);

	useEffect(() => {
		if (!showAddTracks) return undefined;
		let active = true;
		setCatalog(null);
		setCatalogError("");
		const timeout = setTimeout(() => {
			getPublishedTracks({ query, limit: 50 })
				.then((tracks) => {
					if (active) setCatalog(tracks);
				})
				.catch((requestError) => {
					if (active) setCatalogError(requestError.message || "Could not load the music catalog.");
				});
		}, 250);

		return () => {
			active = false;
			clearTimeout(timeout);
		};
	}, [showAddTracks, query]);

	const playlistTracks = playlist?.tracks ?? [];
	const playlistTrackIds = new Set(playlistTracks.map(({ track }) => track._id));
	const totalDuration = playlistTracks.reduce((total, entry) => total + (entry.track.durationSeconds || 0), 0);
	const queue = playlistTracks.map(({ track }) => track);

	async function addTrack(track) {
		if (!playlist || addingTrackId) return;
		setAddingTrackId(track._id);
		setCatalogError("");
		try {
			const result = await addTrackToPlaylist(playlist._id, track._id);
			setPlaylist((current) => ({
				...current,
				tracks: [...current.tracks, { position: result.position, trackId: track._id, track }]
					.sort((first, second) => first.position - second.position),
			}));
		} catch (requestError) {
			setCatalogError(requestError.message || "Could not add that song.");
		} finally {
			setAddingTrackId("");
		}
	}

	async function removeTrack(track) {
		if (!playlist || !window.confirm(`Remove “${track.title}” from this playlist?`)) return;
		setTrackActionError("");
		setRemovingTrackId(track._id);
		try {
			await removeTrackFromPlaylist(playlist._id, track._id);
			setPlaylist((current) => ({
				...current,
				tracks: current.tracks
					.filter((entry) => entry.track._id !== track._id)
					.map((entry, position) => ({ ...entry, position })),
			}));
		} catch (requestError) {
			setTrackActionError(requestError.message || "Could not remove this song.");
		} finally {
			setRemovingTrackId("");
		}
	}

	if (loading) {
		return <div className="page"><Header title="Playlist" onBack={() => onNavigate("Library")} /><p className="empty-state">Loading playlist...</p></div>;
	}

	if (error || !playlist) {
		return <div className="page"><Header title="Playlist" onBack={() => onNavigate("Library")} /><p className="playlist-error" role="alert">{error || "Playlist not found."}</p></div>;
	}

	const artwork = playlist.artworkUrl;
	const creator = playlist.ownerId?.displayName || "You";

	return (
		<div className="page">
			<Header title="Playlist" onBack={() => onNavigate("Library")} />
			<div className="playlist-hero">
				{artwork
					? <img src={artwork} alt={`${playlist.name} cover`} />
					: <div className="playlist-hero__placeholder"><Music2 size={42} /></div>}
				<p>{playlist.visibility === "private" && <Lock size={12} />} {playlist.visibility.toUpperCase()} PLAYLIST</p>
				<h1>{playlist.name}</h1>
				<span>by {creator} · {playlistTracks.length} {playlistTracks.length === 1 ? "song" : "songs"}{totalDuration ? ` · ${formatDuration(totalDuration)}` : ""}</span>
				{playlist.description && <span className="playlist-description">{playlist.description}</span>}
			</div>
			<div className="playlist-actions">
				<button className="playlist-add-button" onClick={() => setShowAddTracks((current) => !current)}>
					<Plus size={18} /> {showAddTracks ? "Done adding" : "Add songs"}
				</button>
				<button
					className="round-play"
					aria-label={`Play ${playlist.name}`}
					disabled={!queue.length}
					onClick={() => onPlay(queue[0], {
						queue,
						queueName: playlist.name,
						returnPage: "Playlist",
						returnItem: playlist,
					})}
				>
					<Play size={20} fill="currentColor" />
				</button>
			</div>
			{showAddTracks && (
				<section className="playlist-add-panel" aria-label="Add songs to playlist">
					<label className="playlist-search">
						<SearchIcon size={17} />
						<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search published songs" />
					</label>
					{catalogError && <p className="playlist-error" role="alert">{catalogError}</p>}
					{!catalog && !catalogError && <p className="empty-state">Loading songs...</p>}
					  {catalog && catalog.map((track) => {
						const alreadyAdded = playlistTrackIds.has(track._id);
						const isAdding = addingTrackId === track._id;
						return (
							<div className="playlist-picker-row" key={track._id}>
								<img src={track.image || ""} alt="" />
								<span><strong>{track.title}</strong><small>{track.artist}</small></span>
								<button
									className="icon-button"
									aria-label={alreadyAdded ? `${track.title} already added` : `Add ${track.title}`}
									disabled={alreadyAdded || Boolean(addingTrackId)}
									onClick={() => addTrack(track)}
								>
									{alreadyAdded ? <Check size={18} /> : <Plus size={18} />}
									{isAdding && <span className="visually-hidden">Adding</span>}
								</button>
							</div>
						);
					})}
					  {catalog && !catalog.length && <p className="empty-state">No matching songs found.</p>}
				</section>
			)}
			<div className="playlist-track-list">
				{trackActionError && <p className="playlist-error" role="alert">{trackActionError}</p>}
				{playlistTracks.map(({ track }, index) => (
					<TrackRow
						key={track._id}
						track={track}
						onRemove={removingTrackId ? undefined : removeTrack}
						index={index + 1}
						onPlay={(selectedTrack) => onPlay(selectedTrack, {
							queue,
							queueName: playlist.name,
							returnPage: "Playlist",
							returnItem: playlist,
						})}
					/>
				))}
			</div>
			{!playlistTracks.length && !showAddTracks && (
				<p className="empty-state">This playlist is empty. Add songs to start listening.</p>
			)}
		</div>
	);
}
