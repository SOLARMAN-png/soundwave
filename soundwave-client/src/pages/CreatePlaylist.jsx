import { useState } from "react";
import { Globe, Lock, Plus } from "lucide-react";
import Header from "../components/Header";
import Button from "../components/Button";
import { createPlaylist } from "../api";

export default function CreatePlaylist({ onNavigate }) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [artworkUrl, setArtworkUrl] = useState("");
	const [visibility, setVisibility] = useState("private");
	const [error, setError] = useState("");
	const [submitting, setSubmitting] = useState(false);

	async function submit(event) {
		event.preventDefault();
		setError("");
		setSubmitting(true);
		try {
			const playlist = await createPlaylist({
				name: name.trim(),
				...(description.trim() ? { description: description.trim() } : {}),
				...(artworkUrl.trim() ? { artworkUrl: artworkUrl.trim() } : {}),
				visibility,
			});
			onNavigate("Playlist", playlist);
		} catch (requestError) {
			setError(requestError.message || "Could not create playlist. Please try again.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="page">
			<Header title="Create Playlist" onBack={() => onNavigate("Library")} />
			<form onSubmit={submit}>
				<div className="create-art" aria-hidden="true">
					<div className="create-art__placeholder"><Plus size={28} /></div>
					<span>Cover image is optional</span>
				</div>
				<label className="field-label" htmlFor="playlist-name">
					Playlist name
					<input
						id="playlist-name"
						className="text-field"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Name your playlist"
						maxLength={100}
						required
						autoFocus
					/>
				</label>
				<label className="field-label" htmlFor="playlist-description">
					Description (optional)
					<textarea
						id="playlist-description"
						className="text-field text-field--area"
						value={description}
						onChange={(event) => setDescription(event.target.value)}
						placeholder="What does this playlist sound like?"
						maxLength={1000}
					/>
				</label>
				<label className="field-label" htmlFor="playlist-artwork">
					Cover image URL (optional)
					<input
						id="playlist-artwork"
						className="text-field"
						type="url"
						value={artworkUrl}
						onChange={(event) => setArtworkUrl(event.target.value)}
						placeholder="https://..."
					/>
				</label>
				<fieldset className="privacy-field">
					<legend>Privacy</legend>
					{[
						{ value: "public", label: "Public", hint: "Visible to signed-in listeners", icon: Globe },
						{ value: "private", label: "Private", hint: "Only you can view this playlist", icon: Lock },
					].map(({ value, label, hint, icon: Icon }) => (
						<label className={`privacy-option ${visibility === value ? "is-selected" : ""}`} key={value}>
							<Icon size={19} />
							<span><strong>{label}</strong><small>{hint}</small></span>
							<input
								type="radio"
								name="visibility"
								value={value}
								checked={visibility === value}
								onChange={() => setVisibility(value)}
							/>
						</label>
					))}
				</fieldset>
				{error && <p className="playlist-error" role="alert">{error}</p>}
				<Button type="submit" className="full-width" disabled={submitting || !name.trim()}>
					{submitting ? "Creating..." : "Create playlist"}
				</Button>
			</form>
		</div>
	);
}
