import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Clock3,
  Disc3,
  Headphones,
  Music2,
  Play,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Header from "../components/Header";
import { getListeningAnalytics, getPublishedAlbum } from "../api";

const periods = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "12m", label: "12 months" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
];
const granularities = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];
const today = new Date().toISOString().slice(0, 10);

function formatDuration(seconds = 0) {
  const safeSeconds = Math.max(0, seconds);
  const totalMinutes = Math.floor(safeSeconds / 60);
  if (totalMinutes === 0) return `${Math.floor(safeSeconds)} sec`;
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function formatDate(value, granularity) {
  const date = new Date(value);
  if (granularity === "month") {
    return date.toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  if (granularity === "week") {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  }
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function Trend({ current, previous, period }) {
  if (period === "all") return <span className="analytics-trend">All-time activity</span>;
  if (!previous) return <span className="analytics-trend">Compared with previous period</span>;
  if (previous === 0) {
    return <span className="analytics-trend">{current > 0 ? "New listening this period" : "No change from previous period"}</span>;
  }
  const change = ((current - previous) / previous) * 100;
  return (
    <span className={`analytics-trend ${change > 0 ? "is-up" : change < 0 ? "is-down" : ""}`}>
      {change > 0 ? "+" : ""}{Math.round(change)}% vs previous period
    </span>
  );
}

function ActivityChart({ data, granularity, metric }) {
  const [activePoint, setActivePoint] = useState(null);
  const values = data.map((item) => item[metric]);
  const max = Math.max(...values, 1);
  const width = 620;
  const height = 220;
  const padding = { top: 18, right: 12, bottom: 34, left: 12 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = data.map((item, index) => ({
    ...item,
    x: padding.left + (data.length < 2 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth),
    y: padding.top + plotHeight - (item[metric] / max) * plotHeight,
  }));
  const line = points.map(({ x, y }, index) => `${index ? "L" : "M"} ${x} ${y}`).join(" ");
  const area = points.length
    ? `${line} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`
    : "";
  const labelIndexes = new Set(
    points.length > 1
      ? [0, Math.round((points.length - 1) / 2), points.length - 1]
      : points.map((_, index) => index),
  );

  if (!data.length) return <div className="analytics-chart-empty">Your listening activity will appear here.</div>;

  return (
    <div className="analytics-chart-wrap">
      {activePoint !== null && points[activePoint] && (
        <div className="analytics-chart-tooltip" role="status">
          <strong>{formatDate(points[activePoint].date, granularity)}</strong>
          <span>{metric === "listeningSeconds" ? formatDuration(points[activePoint][metric]) : `${points[activePoint][metric]} plays`}</span>
        </div>
      )}
      <svg className="analytics-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric === "listeningSeconds" ? "Listening time" : "Track plays"} over time`}>
        <defs>
          <linearGradient id="analytics-chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#9b4dff" stopOpacity=".34" />
            <stop offset="100%" stopColor="#9b4dff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((step) => {
          const y = padding.top + step * plotHeight;
          return <line key={step} x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="analytics-chart-grid" />;
        })}
        <path d={area} fill="url(#analytics-chart-fill)" />
        <path d={line} className="analytics-chart-line" />
        {points.map((point, index) => (
          <g key={point.date}>
            <circle
              cx={point.x}
              cy={point.y}
              r={activePoint === index ? 6 : 4}
              className="analytics-chart-point"
              tabIndex="0"
              aria-label={`${formatDate(point.date, granularity)}: ${metric === "listeningSeconds" ? formatDuration(point[metric]) : `${point[metric]} plays`}`}
              onMouseEnter={() => setActivePoint(index)}
              onMouseLeave={() => setActivePoint(null)}
              onFocus={() => setActivePoint(index)}
              onBlur={() => setActivePoint(null)}
            />
            {labelIndexes.has(index) && (
              <text x={point.x} y={height - 8} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} className="analytics-chart-label">
                {formatDate(point.date, granularity)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function Analytics({ onNavigate, onPlay }) {
  const [period, setPeriod] = useState("30d");
  const [granularity, setGranularity] = useState("day");
  const [chartMetric, setChartMetric] = useState("listeningSeconds");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const waitingForCustomDates = period === "custom" && (!startDate || !endDate);
  const isLoading = loading && !waitingForCustomDates;

  useEffect(() => {
    if (waitingForCustomDates) return undefined;

    let active = true;
    getListeningAnalytics({
      period,
      granularity,
      ...(period === "custom" ? { startDate, endDate } : {}),
    })
      .then((result) => {
        if (active) setAnalytics(result);
      })
      .catch((requestError) => {
        if (active) {
          setAnalytics(null);
          setError(requestError.status === 401
            ? "Sign in to see your personal listening analytics."
            : requestError.message || "Your listening analytics could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [period, granularity, startDate, endDate, waitingForCustomDates]);

  const chartData = analytics?.timeline || [];

  function changeFilters(update) {
    setAnalytics(null);
    setError("");
    setLoading(true);
    update();
  }

  async function playAlbum(albumId) {
    setActionError("");
    try {
      const album = await getPublishedAlbum(albumId);
      if (!album.tracks.length) {
        setActionError("This album has no playable tracks.");
        return;
      }
      onPlay(album.tracks[0], { queue: album.tracks, queueName: album.title, returnPage: "Analytics" });
    } catch (requestError) {
      setActionError(`Could not play this album: ${requestError.message}`);
    }
  }

  const overview = analytics?.overview;
  const previous = analytics?.previous;
  const mostPlayedArtist = analytics?.topArtists?.[0];
  const favoriteGenre = analytics?.topGenres?.[0];
  const listeningChange = analytics?.period !== "all" && previous?.totalListeningSeconds
    ? ((overview.totalListeningSeconds - previous.totalListeningSeconds) / previous.totalListeningSeconds) * 100
    : null;

  return (
    <div className="page analytics-page">
      <Header title="Your Analytics" onBack={() => onNavigate("Home")} />
      <section className="analytics-intro">
        <span className="analytics-eyebrow"><Sparkles size={14} /> YOUR SOUND, IN FOCUS</span>
        <h1>Listening insights</h1>
        <p>Discover the music, artists, and moments that make your listening yours.</p>
      </section>

      <section className="analytics-period" aria-label="Listening period">
        <div className="analytics-section-heading">
          <div><h2>Listening period</h2><p>Choose a time range to explore</p></div>
          <CalendarDays size={18} />
        </div>
        <div className="analytics-period-options">
          {periods.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`filter-pill ${period === option.value ? "is-selected" : ""}`}
              aria-pressed={period === option.value}
              onClick={() => changeFilters(() => setPeriod(option.value))}
            >
              {option.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="analytics-date-range">
            <label>From<input type="date" value={startDate} max={endDate || today} onChange={(event) => changeFilters(() => setStartDate(event.target.value))} /></label>
            <label>To<input type="date" value={endDate} min={startDate || undefined} max={today} onChange={(event) => changeFilters(() => setEndDate(event.target.value))} /></label>
          </div>
        )}
      </section>

      {isLoading && <div className="analytics-state" role="status">Gathering your listening stats…</div>}
      {!isLoading && error && (
        <div className="analytics-state analytics-state--error" role="alert">
          {error}
          {error.startsWith("Sign in") && <button className="analytics-sign-in" type="button" onClick={() => onNavigate("Login")}>Sign in</button>}
        </div>
      )}
      {!isLoading && !error && !analytics && period === "custom" && (
        <div className="analytics-state">Choose both dates to see your listening insights.</div>
      )}
      {!loading && !error && analytics && (
        <>
          <section className="analytics-overview" aria-label="Listening overview">
            {[
              { label: "Listening time", value: formatDuration(overview.totalListeningSeconds), detail: <Trend current={overview.totalListeningSeconds} previous={previous.totalListeningSeconds} period={period} />, icon: Clock3 },
              { label: "Tracks played", value: overview.totalPlays.toLocaleString(), detail: <Trend current={overview.totalPlays} previous={previous.totalPlays} period={period} />, icon: Headphones },
              { label: "Artists", value: overview.artistsListened.toLocaleString(), detail: "Artists discovered", icon: UsersRound },
              { label: "Albums", value: overview.albumsListened.toLocaleString(), detail: "Albums explored", icon: Disc3 },
              { label: "Daily average", value: formatDuration(overview.averageDailyListeningSeconds), detail: "Listening per day", icon: CalendarDays },
            ].map(({ label, value, detail, icon: Icon }) => (
              <article className="analytics-stat-card" key={label}>
                <span className="analytics-stat-icon"><Icon size={17} /></span>
                <span className="analytics-stat-label">{label}</span>
                <strong>{value}</strong>
                <span className="analytics-stat-detail">{detail}</span>
              </article>
            ))}
          </section>

          <section className="analytics-panel analytics-activity">
            <div className="analytics-section-heading">
              <div><h2>Your listening activity</h2><p>How your listening changes over time</p></div>
              <BarChart3 size={19} />
            </div>
            <div className="analytics-chart-controls">
              <div className="analytics-segmented" aria-label="Chart interval">
                {granularities.map((item) => (
                  <button type="button" key={item.value} className={granularity === item.value ? "is-selected" : ""} aria-pressed={granularity === item.value} onClick={() => changeFilters(() => setGranularity(item.value))}>
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="analytics-segmented" aria-label="Chart metric">
                <button type="button" className={chartMetric === "listeningSeconds" ? "is-selected" : ""} aria-pressed={chartMetric === "listeningSeconds"} onClick={() => setChartMetric("listeningSeconds")}>Time</button>
                <button type="button" className={chartMetric === "plays" ? "is-selected" : ""} aria-pressed={chartMetric === "plays"} onClick={() => setChartMetric("plays")}>Plays</button>
              </div>
            </div>
            <ActivityChart data={chartData} granularity={granularity} metric={chartMetric} />
          </section>

          <section className="analytics-insights">
            <div className="analytics-section-heading">
              <div><h2>Made for you</h2><p>A few things your listening tells us</p></div>
              <Sparkles size={18} />
            </div>
            <div className="analytics-insight-grid">
              <article className="analytics-insight-card">
                <span className="analytics-insight-icon"><CalendarDays size={17} /></span>
                <small>YOUR MOST ACTIVE DAY</small>
                <strong>{analytics.mostActiveDay?.name || "Your next listening day"}</strong>
                <p>{analytics.mostActiveDay ? analytics.mostActiveDay.listeningSeconds > 0
                  ? `${formatDuration(analytics.mostActiveDay.listeningSeconds)} of listening`
                  : `${analytics.mostActiveDay.plays} track plays`
                  : "Play a few tracks to uncover your pattern."}</p>
              </article>
              <article className="analytics-insight-card">
                <span className="analytics-insight-icon"><UsersRound size={17} /></span>
                <small>ON REPEAT</small>
                <strong>{mostPlayedArtist?.name || "Artist discovery awaits"}</strong>
                <p>{mostPlayedArtist ? `${mostPlayedArtist.plays} plays in this period` : "Your top artist will show up here."}</p>
              </article>
              <article className="analytics-insight-card">
                <span className="analytics-insight-icon"><Music2 size={17} /></span>
                <small>YOUR FAVORITE GENRE</small>
                <strong>{favoriteGenre?.name || "Find your sound"}</strong>
                <p>{favoriteGenre ? `${favoriteGenre.plays} plays in this period` : "Keep listening to reveal your favorite genre."}</p>
              </article>
              <article className="analytics-insight-card">
                <span className="analytics-insight-icon"><Headphones size={17} /></span>
                <small>LISTENING MOMENTUM</small>
                <strong>{period === "all" ? "Your listening story" : listeningChange === null ? "A fresh start" : listeningChange > 0 ? "You're listening more" : listeningChange < 0 ? "A little quieter lately" : "Steady as ever"}</strong>
                <p>{period === "all" ? "A view across your complete listening history." : listeningChange === null ? "Listen in another period to compare your habits." : `${Math.abs(Math.round(listeningChange))}% ${listeningChange > 0 ? "more" : listeningChange < 0 ? "less" : "change"} listening time than the previous period.`}</p>
              </article>
            </div>
          </section>

          <section className="analytics-panel">
            <div className="analytics-section-heading">
              <div><h2>Top tracks</h2><p>Your most-played songs this period</p></div>
            </div>
            {analytics.topTracks.length ? (
              <div className="analytics-rank-list">
                {analytics.topTracks.map((item, index) => (
                  <article className="analytics-rank-row" key={item._id}>
                    <span className="analytics-rank-number">{String(index + 1).padStart(2, "0")}</span>
                    <img src={item.image || item.artworkUrl || ""} alt="" loading="lazy" />
                    <div className="analytics-rank-copy"><strong>{item.title}</strong><span>{item.artist}</span></div>
                    <div className="analytics-rank-meta"><strong>{item.plays} plays</strong><span>{formatDuration(item.listeningSeconds)}</span></div>
                    <button className="analytics-play-button" type="button" onClick={() => onPlay(item)} aria-label={`Play ${item.title}`}><Play size={16} fill="currentColor" /></button>
                  </article>
                ))}
              </div>
            ) : <p className="analytics-empty">No tracks played during this period yet.</p>}
          </section>

          <section className="analytics-panel">
            <div className="analytics-section-heading">
              <div><h2>Top albums</h2><p>Albums that kept you coming back</p></div>
            </div>
            {analytics.topAlbums.length ? (
              <div className="analytics-album-grid">
                {analytics.topAlbums.map((album) => (
                  <article className="analytics-album-card" key={album._id}>
                    <img src={album.image || album.artworkUrl || ""} alt="" loading="lazy" />
                    <div className="analytics-album-copy"><strong>{album.title}</strong><span>{album.artist}</span><small>{album.plays} plays · {formatDuration(album.listeningSeconds)}</small></div>
                    <button className="analytics-play-button" type="button" onClick={() => playAlbum(album._id)} aria-label={`Play ${album.title}`}><Play size={16} fill="currentColor" /></button>
                  </article>
                ))}
              </div>
            ) : <p className="analytics-empty">Albums you listen to will appear here.</p>}
          </section>

          <section className="analytics-panel">
            <div className="analytics-section-heading">
              <div><h2>Top artists & genres</h2><p>Your listening favorites, ranked</p></div>
            </div>
            <div className="analytics-taste-grid">
              <div className="analytics-taste-list">
                <h3>Artists</h3>
                {analytics.topArtists.length ? analytics.topArtists.map((artist, index) => (
                  <div className="analytics-taste-row" key={artist.id}>
                    <span>{index + 1}</span><img src={artist.imageUrl || ""} alt="" loading="lazy" />
                    <strong>{artist.name}</strong><small>{artist.plays} plays</small>
                  </div>
                )) : <p className="analytics-empty">No artist activity yet.</p>}
              </div>
              <div className="analytics-taste-list">
                <h3>Genres</h3>
                {analytics.topGenres.length ? analytics.topGenres.map((genre, index) => (
                  <div className="analytics-genre-row" key={genre.name}>
                    <span className="analytics-genre-rank">{String(index + 1).padStart(2, "0")}</span>
                    <span className="analytics-genre-name">{genre.name}</span>
                    <span className="analytics-genre-count">{genre.plays}</span>
                    <span className="analytics-genre-bar"><i style={{ width: `${Math.max(8, (genre.plays / analytics.topGenres[0].plays) * 100)}%` }} /></span>
                  </div>
                )) : <p className="analytics-empty">Your favorite genres will appear here.</p>}
              </div>
            </div>
          </section>
          {actionError && <p className="analytics-action-error" role="alert">{actionError}</p>}
        </>
      )}
    </div>
  );
}
