import { useEffect, useState } from "react";
import { Disc3, LoaderCircle } from "lucide-react";
import { useParams } from "react-router-dom";
import Header from "../components/Header";
import TrackRow from "../components/TrackRow";
import { getPublishedAlbum } from "../api";

export default function AlbumPage({ onNavigate, onPlay }) {
  const { id } = useParams();
  const [request, setRequest] = useState({ id: null, album: null, loading: true, error: "" });
  const loading = request.id !== id || request.loading;
  const album = request.id === id ? request.album : null;
  const error = request.id === id ? request.error : "";

  useEffect(() => {
    let active = true;
    getPublishedAlbum(id)
      .then((result) => {
        if (active) setRequest({ id, album: result, loading: false, error: "" });
      })
      .catch((requestError) => {
        if (active) setRequest({
          id,
          album: null,
          loading: false,
          error: requestError.status === 404 ? "This album could not be found." : "Album details are unavailable right now.",
        });
      })

    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="page">
      <Header title="Album" onBack={() => onNavigate("Home")} />
      {loading ? (
        <div className="album-page-state"><LoaderCircle className="admin-spinner" size={18} /> Loading album</div>
      ) : error ? (
        <div className="album-page-state" role="alert">{error}</div>
      ) : album ? (
        <>
          <div className="playlist-hero">
            {album.image ? <img src={album.image} alt={`${album.title} album artwork`} /> : <div className="album-art-placeholder"><Disc3 size={42} /></div>}
            <p>ALBUM</p>
            <h1>{album.title}</h1>
            <span>{album.artist} · {album.tracks.length} {album.tracks.length === 1 ? "track" : "tracks"}{album.releaseDate ? ` · ${new Date(album.releaseDate).getUTCFullYear()}` : ""}</span>
          </div>
          <div className="album-track-list">
            {album.tracks.length ? album.tracks.map((item, index) => (
              <TrackRow key={item._id} track={item} index={item.trackNumber ?? index + 1} onPlay={onPlay} />
            )) : <p className="empty-state">This album has no published tracks yet.</p>}
          </div>
        </>
      ) : null}
    </div>
  );
}
