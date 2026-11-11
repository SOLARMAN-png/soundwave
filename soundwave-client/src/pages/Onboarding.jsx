import { useEffect, useState } from "react";
import { AudioLines, Check, LoaderCircle, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { apiRequest, getArtists, getCurrentUser, getPublishedGenres } from "../api";

const MAX_GENRES = 5;
const MAX_ARTISTS = 10;

function firstName(displayName) {
  return displayName?.trim().split(/\s+/)[0] || "";
}

export default function Onboarding() {
  const location = useLocation();
  const navigate = useNavigate();
  const [genres, setGenres] = useState([]);
  const [initialArtists, setInitialArtists] = useState([]);
  const [artists, setArtists] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedArtistIds, setSelectedArtistIds] = useState([]);
  const [name, setName] = useState("");
  const [artistQuery, setArtistQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadOnboarding() {
      try {
        const [availableGenres, availableArtists, user, saved] = await Promise.all([
          getPublishedGenres(),
          getArtists(),
          getCurrentUser(),
          apiRequest("/api/auth/onboarding"),
        ]);
        if (!active) return;
        if (saved.onboardingCompleted) {
          navigate("/home", { replace: true });
          return;
        }

        setGenres(availableGenres);
        setInitialArtists(availableArtists);
        setArtists(availableArtists);
        setName(firstName(user.displayName));
        setSelectedGenres(saved.preferences.genres);
        setSelectedArtistIds(saved.preferences.artistIds);
      } catch (requestError) {
        if (!active) return;
        if (requestError.status === 401) {
          navigate("/login", { replace: true, state: { from: location } });
          return;
        }
        setError(requestError.message || "Your onboarding choices could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadOnboarding();
    return () => {
      active = false;
    };
  }, [location, navigate]);

  useEffect(() => {
    const query = artistQuery.trim();
    if (!query) return undefined;

    let active = true;
    const timer = setTimeout(() => {
      getArtists({ query })
        .then((items) => {
          if (active) setArtists(items);
        })
        .catch((requestError) => {
          if (active) setError(requestError.message || "Artist search is unavailable.");
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [artistQuery, initialArtists]);

  const visibleArtists = artistQuery.trim() ? artists : initialArtists;

  function toggleGenre(genre) {
    setError("");
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter((item) => item !== genre));
    } else if (selectedGenres.length >= MAX_GENRES) {
      setError(`Choose up to ${MAX_GENRES} genres.`);
    } else {
      setSelectedGenres([...selectedGenres, genre]);
    }
  }

  function toggleArtist(artistId) {
    setError("");
    if (selectedArtistIds.includes(artistId)) {
      setSelectedArtistIds(selectedArtistIds.filter((item) => item !== artistId));
    } else if (selectedArtistIds.length >= MAX_ARTISTS) {
      setError(`Choose up to ${MAX_ARTISTS} artists.`);
    } else {
      setSelectedArtistIds([...selectedArtistIds, artistId]);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!selectedGenres.length && !selectedArtistIds.length) {
      setError("Choose at least one genre or artist to continue.");
      return;
    }

    setSaving(true);
    try {
      const saved = await apiRequest("/api/auth/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genres: selectedGenres, artistIds: selectedArtistIds }),
      });
      if (!saved.onboardingCompleted) {
        throw new Error("Your choices were saved, but onboarding is not complete yet. Please try again.");
      }
      navigate("/home", { replace: true });
    } catch (requestError) {
      setError(requestError.message || "Your choices could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="onboarding-screen">
      <header className="onboarding-topbar">
        <span className="auth-wordmark"><AudioLines size={19} /> SoundWave</span>
        <span className="onboarding-step">FIRST LISTEN</span>
      </header>
      <section className="onboarding-heading">
        <p className="auth-kicker">A LITTLE ABOUT YOU</p>
        <h1>What sounds like you{name ? `, ${name}` : ""}?</h1>
        <p>Choose genres and artists for your first mix.</p>
      </section>

      {loading ? (
        <div className="onboarding-loading"><LoaderCircle size={20} /> Loading the catalog</div>
      ) : (
        <form className="onboarding-form" onSubmit={submit}>
          <section className="onboarding-group" aria-labelledby="onboarding-genres-title">
            <div className="onboarding-group__heading">
              <h2 id="onboarding-genres-title">Genres</h2>
              <span>{selectedGenres.length} / {MAX_GENRES}</span>
            </div>
            <div className="onboarding-chips">
              {genres.map((genre) => {
                const selected = selectedGenres.includes(genre);
                return (
                  <button
                    key={genre}
                    type="button"
                    className={`onboarding-chip${selected ? " is-selected" : ""}`}
                    aria-pressed={selected}
                    onClick={() => toggleGenre(genre)}
                  >
                    {selected && <Check size={14} />}{genre}
                  </button>
                );
              })}
              {!genres.length && <p className="onboarding-empty">No published genres are available yet.</p>}
            </div>
          </section>

          <section className="onboarding-group" aria-labelledby="onboarding-artists-title">
            <div className="onboarding-group__heading">
              <h2 id="onboarding-artists-title">Artists</h2>
              <span>{selectedArtistIds.length} / {MAX_ARTISTS}</span>
            </div>
            <label className="onboarding-search">
              <Search size={16} aria-hidden="true" />
              <span className="visually-hidden">Search artists</span>
              <input value={artistQuery} onChange={(event) => setArtistQuery(event.target.value)} placeholder="Search artists" />
            </label>
            <div className="onboarding-artists">
              {visibleArtists.map((artist) => {
                const selected = selectedArtistIds.includes(artist._id);
                return (
                  <button
                    key={artist._id}
                    type="button"
                    className={`onboarding-artist${selected ? " is-selected" : ""}`}
                    aria-pressed={selected}
                    onClick={() => toggleArtist(artist._id)}
                  >
                    {artist.imageUrl
                      ? <img src={artist.imageUrl} alt="" />
                      : <span className="onboarding-artist__placeholder"><AudioLines size={18} /></span>}
                    <span className="onboarding-artist__name">{artist.name}</span>
                    {selected && <Check size={16} />}
                  </button>
                );
              })}
              {!visibleArtists.length && <p className="onboarding-empty">No artists match this search.</p>}
            </div>
          </section>

          {error && <p className="onboarding-error" role="alert">{error}</p>}
          <Button type="submit" className="onboarding-submit" disabled={saving || (!selectedGenres.length && !selectedArtistIds.length)}>
            {saving ? "Saving your mix..." : "Build my starting mix"}
            {!saving && <Check size={17} />}
          </Button>
        </form>
      )}
    </main>
  );
}