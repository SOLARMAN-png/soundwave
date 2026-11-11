import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Check,
  Disc3,
  ImagePlus,
  LoaderCircle,
  LogOut,
  Music2,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { apiRequest } from "../api";

const emptyTrack = {
  title: "",
  artist: "",
  album: "",
  genre: "",
  durationSeconds: "",
  explicit: false,
};
const emptyAlbum = { title: "", artist: "", releaseDate: "" };

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function readAudioDuration(file) {
  return new Promise((resolve) => {
    const source = URL.createObjectURL(file);
    const audio = new Audio();
    const finish = (duration) => {
      URL.revokeObjectURL(source);
      resolve(Number.isFinite(duration) && duration > 0 ? String(Math.round(duration)) : "");
    };
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(0);
    audio.src = source;
  });
}

function audioFileKey(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function TrackArtwork({ track }) {
  return track.artworkUrl ? (
    <img className="admin-track-art" src={track.artworkUrl} alt="" />
  ) : (
    <span className="admin-track-art admin-track-art--empty"><Music2 size={18} /></span>
  );
}

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [authStatus, setAuthStatus] = useState("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [track, setTrack] = useState(emptyTrack);
  const [album, setAlbum] = useState(emptyAlbum);
  const [albumTracks, setAlbumTracks] = useState([]);
  const [audioFile, setAudioFile] = useState(null);
  const [artworkFile, setArtworkFile] = useState(null);
  const [albumArtworkFile, setAlbumArtworkFile] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [albumNotice, setAlbumNotice] = useState(null);
  const [albumError, setAlbumError] = useState("");
  const [uploadingAlbum, setUploadingAlbum] = useState(false);
  const [albumUploadProgress, setAlbumUploadProgress] = useState("");
  const [albums, setAlbums] = useState([]);
  const [deletingKey, setDeletingKey] = useState("");
  const [catalogActionError, setCatalogActionError] = useState("");
  const [catalogActionNotice, setCatalogActionNotice] = useState("");
  const audioInput = useRef(null);
  const artworkInput = useRef(null);
  const albumArtworkInput = useRef(null);
  const albumAudioInput = useRef(null);

  async function loadCatalog(showLoading = true) {
    if (showLoading) setLoadingTracks(true);
    try {
      const [managedTracks, managedAlbums] = await Promise.all([
        apiRequest("/api/admin/tracks"),
        apiRequest("/api/admin/albums"),
      ]);
      setTracks(managedTracks);
      setAlbums(managedAlbums);
    } catch (error) {
      setUploadError(error.message);
    } finally {
      setLoadingTracks(false);
    }
  }

  useEffect(() => {
    let active = true;
    apiRequest("/api/admin/me")
      .then((currentUser) => {
        if (!active) return;
        setUser(currentUser);
        setAuthStatus("ready");
        return loadCatalog();
      })
      .catch((error) => {
        if (active) {
          setAuthError(error.status >= 500 ? error.message : "");
          setAuthStatus("signed-out");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setAuthError("");
    try {
      await apiRequest("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const currentUser = await apiRequest("/api/admin/me");
      const [managedTracks, managedAlbums] = await Promise.all([
        apiRequest("/api/admin/tracks"),
        apiRequest("/api/admin/albums"),
      ]);
      setUser(currentUser);
      setTracks(managedTracks);
      setAlbums(managedAlbums);
      setLoadingTracks(false);
      setAuthStatus("ready");
      setPassword("");
    } catch (error) {
      setAuthError(
        error.code === "EMAIL_NOT_VERIFIED"
          ? error.message
          : error.status === 403
          ? "This account is not listed in the API's ADMIN_EMAILS setting."
          : error.status === 401
            ? "Email or password was not accepted."
            : error.message,
      );
    }
  }

  async function handleLogout() {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      setAuthStatus("signed-out");
      setTracks([]);
      setAlbums([]);
    }
  }

  function updateTrack(field, value) {
    setTrack((current) => ({ ...current, [field]: value }));
  }

  function updateAlbum(field, value) {
    setAlbum((current) => ({ ...current, [field]: value }));
  }

  function updateAlbumTrack(index, field, value) {
    setAlbumTracks((current) => current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, [field]: value } : item,
    ));
  }

  function selectAlbumAudioFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    setAlbumError("");
    setAlbumTracks((current) => {
      const selectedKeys = new Set(current.map(({ file }) => audioFileKey(file)));
      const newFiles = files.filter((file) => !selectedKeys.has(audioFileKey(file)));
      return [...current, ...newFiles.map((file) => ({
        file,
        title: file.name.replace(/\.[^.]+$/, ""),
        genre: "",
        durationSeconds: "",
        explicit: false,
      }))];
    });

    Promise.all(files.map(readAudioDuration)).then((durations) => {
      const durationByFile = new Map(files.map((file, index) => [audioFileKey(file), durations[index]]));
      setAlbumTracks((current) => current.map((item) => ({
        ...item,
        durationSeconds: item.durationSeconds || durationByFile.get(audioFileKey(item.file)) || "",
      })));
    });
  }

  function removeAlbumTrack(index) {
    setAlbumTracks((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function uploadToCloudinary(file, mediaType) {
    const signature = await apiRequest("/api/admin/uploads/signature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaType }),
    });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", signature.apiKey);
    formData.append("timestamp", String(signature.timestamp));
    formData.append("folder", signature.folder);
    formData.append("public_id", signature.public_id);
    formData.append("signature", signature.signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resourceType}/upload`,
      { method: "POST", body: formData },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error?.message || "Cloudinary upload failed");

    return { url: result.secure_url, publicId: result.public_id };
  }

  async function handleUpload(event) {
    event.preventDefault();
    setUploadError("");
    setNotice(null);

    if (!audioFile || !artworkFile) {
      setUploadError("Choose both an audio file and cover artwork.");
      return;
    }
    if (audioFile.size > 100 * 1024 * 1024 || artworkFile.size > 8 * 1024 * 1024) {
      setUploadError("Audio must be 100 MB or smaller; artwork must be 8 MB or smaller.");
      return;
    }
    if (!audioFile.type.startsWith("audio/") || !artworkFile.type.startsWith("image/")) {
      setUploadError("Choose a supported audio file and an image file.");
      return;
    }

    setUploading(true);
    try {
      const [audio, artwork] = await Promise.all([
        uploadToCloudinary(audioFile, "audio"),
        uploadToCloudinary(artworkFile, "artwork"),
      ]);
      await apiRequest("/api/admin/tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...track,
          durationSeconds: Number(track.durationSeconds),
          explicit: String(track.explicit),
          audioUrl: audio.url,
          audioPublicId: audio.publicId,
          artworkUrl: artwork.url,
          artworkPublicId: artwork.publicId,
        }),
      });
      setTrack(emptyTrack);
      setAudioFile(null);
      setArtworkFile(null);
      if (audioInput.current) audioInput.current.value = "";
      if (artworkInput.current) artworkInput.current.value = "";
      setNotice("Track published to Soundwave.");
      await loadCatalog();
    } catch (error) {
      setUploadError(error.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleAlbumUpload(event) {
    event.preventDefault();
    setAlbumError("");
    setAlbumNotice(null);

    if (!albumArtworkFile || albumTracks.length === 0) {
      setAlbumError("Choose album artwork and at least one audio file.");
      return;
    }
    if (albumTracks.length > 50) {
      setAlbumError("An album can contain up to 50 tracks.");
      return;
    }
    if (albumArtworkFile.size > 8 * 1024 * 1024) {
      setAlbumError("Album artwork must be 8 MB or smaller.");
      return;
    }
    if (albumTracks.some((item) => item.file.size > 100 * 1024 * 1024)) {
      setAlbumError("Each audio file must be 100 MB or smaller.");
      return;
    }
    if (albumTracks.some((item) => !item.file.type.startsWith("audio/"))) {
      setAlbumError("Choose supported audio files for every track.");
      return;
    }
    if (albumTracks.some((item) =>
      !item.title.trim() ||
      !item.genre.trim() ||
      !Number.isInteger(Number(item.durationSeconds)) ||
      Number(item.durationSeconds) < 1 ||
      Number(item.durationSeconds) > 86400,
    )) {
      setAlbumError("Add a title, genre, and valid duration for every track.");
      return;
    }
    if (!albumArtworkFile.type.startsWith("image/")) {
      setAlbumError("Choose an image file for the album artwork.");
      return;
    }

    setUploadingAlbum(true);
    try {
      setAlbumUploadProgress("Uploading artwork");
      const artwork = await uploadToCloudinary(albumArtworkFile, "artwork");
      const uploadedTracks = [];
      for (const [index, item] of albumTracks.entries()) {
        setAlbumUploadProgress(`Track ${index + 1} of ${albumTracks.length}`);
        const audio = await uploadToCloudinary(item.file, "audio");
        uploadedTracks.push({
          title: item.title.trim(),
          genre: item.genre.trim(),
          durationSeconds: Number(item.durationSeconds),
          explicit: item.explicit,
          ...audio,
        });
      }
      setAlbumUploadProgress("Publishing album");
      await apiRequest("/api/admin/albums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...album,
          ...(album.releaseDate ? {} : { releaseDate: undefined }),
          artworkUrl: artwork.url,
          artworkPublicId: artwork.publicId,
          tracks: uploadedTracks.map((item) => ({
            title: item.title,
            genre: item.genre,
            durationSeconds: item.durationSeconds,
            explicit: item.explicit,
            audioUrl: item.url,
            audioPublicId: item.publicId,
          })),
        }),
      });
      setAlbum(emptyAlbum);
      setAlbumTracks([]);
      setAlbumArtworkFile(null);
      if (albumArtworkInput.current) albumArtworkInput.current.value = "";
      if (albumAudioInput.current) albumAudioInput.current.value = "";
      setAlbumNotice(`Album and ${uploadedTracks.length} tracks published to Soundwave.`);
      await loadCatalog();
    } catch (error) {
      setAlbumError(error.message);
    } finally {
      setUploadingAlbum(false);
      setAlbumUploadProgress("");
    }
  }

  async function deleteCatalogItem(type, item) {
    const label = type === "track" ? "track" : "album and all of its tracks";
    if (!window.confirm(`Permanently delete this ${label}: "${item.title}"?`)) return;

    const key = `${type}:${item._id}`;
    setDeletingKey(key);
    setCatalogActionError("");
    setCatalogActionNotice("");
    try {
      await apiRequest(`/api/admin/${type}s/${encodeURIComponent(item._id)}`, { method: "DELETE" });
      if (type === "track") {
        setTracks((current) => current.filter((entry) => entry._id !== item._id));
      } else {
        setAlbums((current) => current.filter((entry) => entry._id !== item._id));
        setTracks((current) => current.filter((entry) => entry.albumId?._id !== item._id));
      }
      await loadCatalog(false);
      setCatalogActionNotice(`${type === "track" ? "Track" : "Album"} deleted.`);
    } catch (error) {
      setCatalogActionError(error.message);
    } finally {
      setDeletingKey("");
    }
  }

  if (authStatus === "checking") {
    return <main className="admin-gate"><LoaderCircle className="admin-spinner" /><span>Checking administrator session</span></main>;
  }

  if (!user) {
    return (
      <main className="admin-gate">
        <form className="admin-login" onSubmit={handleLogin}>
          <div className="admin-brand"><AudioLines size={22} /><span>SOUNDWAVE <i>STUDIO</i></span></div>
          <div className="admin-login__mark"><ShieldCheck size={25} /></div>
          <p className="admin-kicker">ADMIN ACCESS</p>
          <h1>Sign in to Studio</h1>
          <p className="admin-login__copy">Use an administrator account to manage the Soundwave catalog.</p>
          {authError && <p className="admin-alert" role="alert">{authError}</p>}
          <label className="admin-field">Email address
            <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="admin-field">Password
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <button className="admin-primary" type="submit">Continue <span>→</span></button>
          <a className="admin-back-link" href="/home">Back to Soundwave</a>
        </form>
      </main>
    );
  }

  const publishedCount = tracks.filter((item) => item.published !== false).length;

  return (
    <main className="admin-console">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/home"><AudioLines size={23} /><span>SOUNDWAVE <i>STUDIO</i></span></a>
        <div className="admin-sidebar__label">WORKSPACE</div>
        <a className="admin-sidebar__link is-active" href="#catalog"><Disc3 size={17} /> Catalog</a>
        <a className="admin-sidebar__link" href="#upload"><Upload size={17} /> Upload track</a>
        <a className="admin-sidebar__link" href="#upload-album"><ImagePlus size={17} /> Upload album</a>
        <div className="admin-sidebar__bottom">
          <div className="admin-user"><span>{user.displayName?.slice(0, 1) || "A"}</span><div><strong>{user.displayName}</strong><small>Administrator</small></div></div>
          <button className="admin-logout" onClick={handleLogout}><LogOut size={16} /> Sign out</button>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar"><div><span className="admin-status-dot" /> CATALOG MANAGEMENT</div><span>Soundwave Studio</span></header>
        <div className="admin-content">
          <div className="admin-heading"><div><p className="admin-kicker">MUSIC LIBRARY</p><h1>Catalog</h1><p>Upload music and manage what listeners can play.</p></div><a className="admin-primary admin-heading__action" href="#upload"><Upload size={16} /> Add a track</a></div>

          <section className="admin-statline" aria-label="Catalog summary">
            <div><span>Published tracks</span><strong>{publishedCount}</strong></div>
            <div><span>Storage</span><strong>Cloudinary</strong></div>
            <div><span>Database</span><strong className="admin-ready"><Check size={15} /> Atlas connected</strong></div>
          </section>

          <section className="admin-panel" id="upload">
            <div className="admin-panel__heading"><div><span className="admin-section-icon"><Music2 size={18} /></span><div><h2>Upload a track</h2><p>Media is stored in Cloudinary; catalog details are published to MongoDB.</p></div></div><span className="admin-published-tag"><span /> PUBLISH ON SAVE</span></div>
            <form className="admin-upload-form" onSubmit={handleUpload}>
              <div className="admin-fields-grid">
                <label className="admin-field">Track title<input value={track.title} onChange={(event) => updateTrack("title", event.target.value)} maxLength={200} required placeholder="e.g. After the Rain" /></label>
                <label className="admin-field">Artist<input value={track.artist} onChange={(event) => updateTrack("artist", event.target.value)} maxLength={160} required placeholder="Artist name" /></label>
                <label className="admin-field">Album<input value={track.album} onChange={(event) => updateTrack("album", event.target.value)} maxLength={200} required placeholder="Album title" /></label>
                <label className="admin-field">Genre<input value={track.genre} onChange={(event) => updateTrack("genre", event.target.value)} maxLength={80} required placeholder="e.g. Alternative" /></label>
                <label className="admin-field">Duration in seconds<input type="number" min="1" max="86400" value={track.durationSeconds} onChange={(event) => updateTrack("durationSeconds", event.target.value)} required placeholder=" e.g. 214" /></label>
                <label className="admin-explicit"><input type="checkbox" checked={track.explicit} onChange={(event) => updateTrack("explicit", event.target.checked)} /><span>Explicit content</span></label>
              </div>

              <div className="admin-file-grid">
                <label className={`admin-file-target ${audioFile ? "has-file" : ""}`}>
                  <input ref={audioInput} type="file" accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg,.aac" onChange={(event) => setAudioFile(event.target.files?.[0] || null)} />
                  <span className="admin-file-icon"><Music2 size={20} /></span><strong>{audioFile ? audioFile.name : "Choose audio file"}</strong><small>MP3, M4A, FLAC, WAV · up to 100 MB</small>
                </label>
                <label className={`admin-file-target ${artworkFile ? "has-file" : ""}`}>
                  <input ref={artworkInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => setArtworkFile(event.target.files?.[0] || null)} />
                  <span className="admin-file-icon"><ImagePlus size={20} /></span><strong>{artworkFile ? artworkFile.name : "Choose cover artwork"}</strong><small>JPEG, PNG, WebP, AVIF · up to 8 MB</small>
                </label>
              </div>

              {uploadError && <p className="admin-alert" role="alert">{uploadError}</p>}
              {notice && <p className="admin-notice" role="status"><Check size={16} /> {notice}</p>}
              <div className="admin-form-footer"><span>Files upload directly to your signed Cloudinary account.</span><button className="admin-primary" type="submit" disabled={uploading}>{uploading ? <><LoaderCircle className="admin-spinner" size={17} /> Uploading</> : <><Upload size={16} /> Upload &amp; publish</>}</button></div>
            </form>
          </section>

          <section className="admin-panel" id="upload-album">
            <div className="admin-panel__heading"><div><span className="admin-section-icon"><Disc3 size={18} /></span><div><h2>Upload an album</h2><p>Add its artwork, release details, and individual audio tracks.</p></div></div><span className="admin-published-tag"><span /> PUBLISH ON SAVE</span></div>
            <form className="admin-upload-form" onSubmit={handleAlbumUpload}>
              <div className="admin-fields-grid">
                <label className="admin-field">Album title<input value={album.title} onChange={(event) => updateAlbum("title", event.target.value)} maxLength={200} required placeholder="e.g. Blue Hour" /></label>
                <label className="admin-field">Artist<input value={album.artist} onChange={(event) => updateAlbum("artist", event.target.value)} maxLength={160} required placeholder="Artist name" /></label>
                <label className="admin-field">Release date <span className="admin-optional">Optional</span><input type="date" value={album.releaseDate} onChange={(event) => updateAlbum("releaseDate", event.target.value)} /></label>
              </div>

              <div className="admin-file-grid admin-file-grid--single">
                <label className={`admin-file-target ${albumTracks.length ? "has-file" : ""}`}>
                  <input ref={albumAudioInput} type="file" accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg,.aac" multiple onChange={selectAlbumAudioFiles} />
                  <span className="admin-file-icon"><Music2 size={20} /></span><strong>{albumTracks.length ? `${albumTracks.length} audio tracks selected · add more files` : "Choose multiple audio files"}</strong><small>Select one audio file per track · up to 50 tracks · 100 MB each</small>
                </label>
              </div>

              {albumTracks.length > 0 && <div className="admin-album-track-list" aria-label="Album track details">
                {albumTracks.map((item, index) => <div className="admin-album-track" key={audioFileKey(item.file)}>
                  <div className="admin-album-track__heading"><strong>Track {index + 1}</strong><span>{item.file.name}</span><button className="admin-album-track__remove" type="button" title={`Remove ${item.file.name}`} aria-label={`Remove ${item.file.name}`} onClick={() => removeAlbumTrack(index)}><X size={15} /></button></div>
                  <div className="admin-fields-grid">
                    <label className="admin-field">Track title<input value={item.title} onChange={(event) => updateAlbumTrack(index, "title", event.target.value)} maxLength={200} required /></label>
                    <label className="admin-field">Genre<input value={item.genre} onChange={(event) => updateAlbumTrack(index, "genre", event.target.value)} maxLength={80} required placeholder="e.g. Alternative" /></label>
                    <label className="admin-field">Duration in seconds<input type="number" min="1" max="86400" value={item.durationSeconds} onChange={(event) => updateAlbumTrack(index, "durationSeconds", event.target.value)} required /></label>
                    <label className="admin-explicit"><input type="checkbox" checked={item.explicit} onChange={(event) => updateAlbumTrack(index, "explicit", event.target.checked)} /><span>Explicit content</span></label>
                  </div>
                </div>)}
              </div>}

              <div className="admin-file-grid admin-file-grid--single">
                <label className={`admin-file-target ${albumArtworkFile ? "has-file" : ""}`}>
                  <input ref={albumArtworkInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => setAlbumArtworkFile(event.target.files?.[0] || null)} />
                  <span className="admin-file-icon"><ImagePlus size={20} /></span><strong>{albumArtworkFile ? albumArtworkFile.name : "Choose album artwork"}</strong><small>JPEG, PNG, WebP, AVIF · up to 8 MB</small>
                </label>
              </div>

              {albumError && <p className="admin-alert" role="alert">{albumError}</p>}
              {albumNotice && <p className="admin-notice" role="status"><Check size={16} /> {albumNotice}</p>}
              <div className="admin-form-footer"><span>Audio and artwork are verified in your signed Cloudinary account.</span><button className="admin-primary" type="submit" disabled={uploadingAlbum}>{uploadingAlbum ? <><LoaderCircle className="admin-spinner" size={17} /> {albumUploadProgress || "Uploading"}</> : <><Upload size={16} /> Upload &amp; publish</>}</button></div>
            </form>
          </section>

          <section className="admin-catalog" id="catalog">
            <div className="admin-catalog__heading"><div><p className="admin-kicker">LIBRARY</p><h2>Recent uploads</h2></div><span>{tracks.length + albums.length} shown</span></div>
            {uploadError && !notice && <p className="admin-alert" role="alert">{uploadError}</p>}
            {catalogActionError && <p className="admin-alert" role="alert">{catalogActionError}</p>}
            {catalogActionNotice && <p className="admin-notice" role="status"><Check size={16} /> {catalogActionNotice}</p>}
            <div className="admin-track-table">
              <div className="admin-track-table__head"><span>TRACK</span><span>ALBUM</span><span>GENRE</span><span>LENGTH</span><span>STATUS</span><span>ACTION</span></div>
              {loadingTracks ? <div className="admin-table-state"><LoaderCircle className="admin-spinner" /> Loading catalog</div> : tracks.length ? tracks.map((item) => {
                const artist = item.artistIds?.map((entry) => entry.name).filter(Boolean).join(", ") || "Unknown artist";
                const key = `track:${item._id}`;
                return <article className="admin-track-row" key={item._id}><div className="admin-track-row__identity"><TrackArtwork track={item} /><div><strong>{item.title}</strong><small>{artist}</small></div></div><span className="admin-track-row__album">{item.albumId?.title || "Single"}</span><span className="admin-track-row__genre">{item.genre || "—"}</span><span>{formatDuration(item.durationSeconds || 0)}</span><span className="admin-track-status"><i /> Published</span><button className="admin-delete-button" type="button" title={`Delete ${item.title}`} aria-label={`Delete track ${item.title}`} disabled={Boolean(deletingKey)} onClick={() => deleteCatalogItem("track", item)}>{deletingKey === key ? <LoaderCircle className="admin-spinner" size={16} /> : <Trash2 size={16} />}</button></article>;
              }) : <div className="admin-table-state">No tracks yet. Your first upload will appear here.</div>}
            </div>
            <div className="admin-album-table">
              <div className="admin-catalog__heading"><div><p className="admin-kicker">ALBUMS</p><h2>Recent albums</h2></div><span>{albums.length} shown</span></div>
              <div className="admin-album-table__head"><span>ALBUM</span><span>ARTIST</span><span>RELEASE</span><span>ACTION</span></div>
              {loadingTracks ? <div className="admin-table-state"><LoaderCircle className="admin-spinner" /> Loading albums</div> : albums.length ? albums.map((item) => {
                const artist = item.artistIds?.map((entry) => entry.name).filter(Boolean).join(", ") || "Unknown artist";
                const key = `album:${item._id}`;
                return <article className="admin-album-row" key={item._id}><div className="admin-track-row__identity"><TrackArtwork track={item} /><div><strong>{item.title}</strong><small>{artist}</small></div></div><span>{item.releaseDate ? new Date(item.releaseDate).toLocaleDateString() : "—"}</span><button className="admin-delete-button" type="button" title={`Delete ${item.title} and its tracks`} aria-label={`Delete album ${item.title} and its tracks`} disabled={Boolean(deletingKey)} onClick={() => deleteCatalogItem("album", item)}>{deletingKey === key ? <LoaderCircle className="admin-spinner" size={16} /> : <Trash2 size={16} />}</button></article>;
              }) : <div className="admin-table-state">No albums yet.</div>}
            </div>
          </section>
          <footer className="admin-footer"><span>Soundwave Studio</span><span>Private catalog tools <ShieldCheck size={13} /></span></footer>
        </div>
      </section>
    </main>
  );
}