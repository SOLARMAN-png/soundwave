import mongoose, { type Types } from "mongoose";
import type { Request, RequestHandler } from "express";
import { PlaybackEventModel, TrackModel } from "../../models/index.js";
import { analyticsQuerySchema } from "./analytics.validation.js";

const dayMilliseconds = 24 * 60 * 60 * 1000;

interface TrackTotals {
  _id: Types.ObjectId;
  plays: number;
  listeningSeconds: number;
}

interface TimelineBucket {
  _id: Date;
  plays: number;
  listeningSeconds: number;
}

interface ArtistSummary {
  _id: Types.ObjectId;
  name: string;
  imageUrl?: string;
}

interface AlbumSummary {
  _id: Types.ObjectId;
  title: string;
  artworkUrl?: string;
}

interface TrackSummary {
  _id: Types.ObjectId;
  title: string;
  genre: string;
  durationSeconds: number;
  audioUrl?: string;
  artworkUrl?: string;
  artistIds: ArtistSummary[];
  albumId?: AlbumSummary | null;
}

function currentUserId(request: Request) {
  const id: unknown = request.authenticatedUser?.id;
  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    throw new Error("Authenticated user is missing a valid ID");
  }
  return new mongoose.Types.ObjectId(id);
}

function eventFilter(userId: Types.ObjectId, start?: Date, end?: Date) {
  return {
    userId,
    ...(start || end
      ? {
          playedAt: {
            ...(start ? { $gte: start } : {}),
            ...(end ? { $lt: end } : {}),
          },
        }
      : {}),
  };
}

function subtractCalendarMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function totalsPipeline(filter: ReturnType<typeof eventFilter>) {
  return [
    { $match: filter },
    {
      $group: {
        _id: "$trackId",
        plays: { $sum: 1 },
        listeningSeconds: { $sum: "$secondsPlayed" },
      },
    },
  ];
}

export const getListeningAnalytics: RequestHandler = async (request, response) => {
  const parsed = analyticsQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid analytics filters",
      details: parsed.error.issues.map(({ path, message }) => ({ path, message })),
    });
    return;
  }

  const { period, granularity } = parsed.data;
  const now = new Date();
  let start: Date | undefined;
  let end = now;
  let windowDays: number | undefined;

  if (period === "custom") {
    start = new Date(`${parsed.data.startDate}T00:00:00.000Z`);
    end = new Date(`${parsed.data.endDate}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    windowDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / dayMilliseconds));
  } else if (period === "7d" || period === "30d") {
    windowDays = period === "7d" ? 7 : 30;
    start = new Date(now.getTime() - windowDays * dayMilliseconds);
  } else if (period !== "all") {
    const months = period === "3m" ? 3 : period === "6m" ? 6 : 12;
    start = subtractCalendarMonths(now, months);
    windowDays = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / dayMilliseconds));
  }

  const userId = currentUserId(request);
  const currentFilter = eventFilter(userId, start, end);
  const previousFilter = start && windowDays
    ? eventFilter(userId, new Date(start.getTime() - windowDays * dayMilliseconds), start)
    : null;
  const timelinePipeline = [
    { $match: currentFilter },
    {
      $group: {
        _id: {
          $dateTrunc: {
            date: "$playedAt",
            unit: granularity,
            ...(granularity === "week" ? { startOfWeek: "monday" } : {}),
          },
        },
        plays: { $sum: 1 },
        listeningSeconds: { $sum: "$secondsPlayed" },
      },
    },
    { $sort: { _id: 1 as const } },
  ];

  const [trackTotals, timeline, previousTotals, firstEvent] = await Promise.all([
    PlaybackEventModel.aggregate<TrackTotals>(totalsPipeline(currentFilter)).exec(),
    PlaybackEventModel.aggregate<TimelineBucket>(timelinePipeline).exec(),
    previousFilter
      ? PlaybackEventModel.aggregate<{ plays: number; listeningSeconds: number }>([
          { $match: previousFilter },
          {
            $group: {
              _id: null,
              plays: { $sum: 1 },
              listeningSeconds: { $sum: "$secondsPlayed" },
            },
          },
        ]).exec()
      : Promise.resolve([]),
    period === "all"
      ? PlaybackEventModel.findOne({ userId }).sort({ playedAt: 1 }).select("playedAt").lean().exec()
      : Promise.resolve(null),
  ]);
  const effectiveStart = start ?? firstEvent?.playedAt;
  const averageWindowDays = windowDays ?? (effectiveStart
    ? Math.max(1, Math.ceil((now.getTime() - effectiveStart.getTime()) / dayMilliseconds))
    : 0);

  const tracks = trackTotals.length
    ? await TrackModel.find({ _id: { $in: trackTotals.map(({ _id }) => _id) } })
        .select("title genre durationSeconds audioUrl artworkUrl artistIds albumId")
        .populate<{ artistIds: ArtistSummary[] }>("artistIds", "name imageUrl")
        .populate<{ albumId: AlbumSummary | null }>("albumId", "title artworkUrl")
        .lean()
        .exec()
    : [];
  const totalsByTrack = new Map(trackTotals.map((item) => [item._id.toString(), item]));
  const trackDetails = tracks.map((track) => ({
    track,
    totals: totalsByTrack.get(track._id.toString())!,
  }));
  const plays = trackTotals.reduce((sum, item) => sum + item.plays, 0);
  const listeningSeconds = trackTotals.reduce((sum, item) => sum + item.listeningSeconds, 0);
  const artists = new Map<string, { artist: ArtistSummary; plays: number; listeningSeconds: number }>();
  const albums = new Map<string, { album: AlbumSummary; plays: number; listeningSeconds: number }>();
  const genres = new Map<string, { name: string; plays: number; listeningSeconds: number }>();

  for (const { track, totals } of trackDetails) {
    for (const artist of track.artistIds) {
      if (!artist) continue;
      const key = artist._id.toString();
      const entry = artists.get(key) ?? { artist, plays: 0, listeningSeconds: 0 };
      entry.plays += totals.plays;
      entry.listeningSeconds += totals.listeningSeconds;
      artists.set(key, entry);
    }
    if (track.albumId) {
      const key = track.albumId._id.toString();
      const entry = albums.get(key) ?? { album: track.albumId, plays: 0, listeningSeconds: 0 };
      entry.plays += totals.plays;
      entry.listeningSeconds += totals.listeningSeconds;
      albums.set(key, entry);
    }
    const genreName = track.genre.trim();
    if (genreName) {
      const key = genreName.toLowerCase();
      const entry = genres.get(key) ?? { name: genreName, plays: 0, listeningSeconds: 0 };
      entry.plays += totals.plays;
      entry.listeningSeconds += totals.listeningSeconds;
      genres.set(key, entry);
    }
  }

  const mostActiveDay = await PlaybackEventModel.aggregate<{
    _id: number;
    listeningSeconds: number;
    plays: number;
  }>([
    { $match: currentFilter },
    {
      $group: {
        _id: { $dayOfWeek: "$playedAt" },
        listeningSeconds: { $sum: "$secondsPlayed" },
        plays: { $sum: 1 },
      },
    },
    { $sort: { listeningSeconds: -1, plays: -1, _id: 1 } },
    { $limit: 1 },
  ]).exec();
  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const previous = previousTotals[0] ?? { plays: 0, listeningSeconds: 0 };

  response.status(200).json({
    data: {
      period,
      granularity,
      range: {
        start: effectiveStart?.toISOString() ?? null,
        end: end.toISOString(),
        days: windowDays ?? null,
      },
      overview: {
        totalListeningSeconds: listeningSeconds,
        totalPlays: plays,
        tracksListened: trackDetails.length,
        artistsListened: artists.size,
        albumsListened: albums.size,
        averageDailyListeningSeconds: averageWindowDays ? listeningSeconds / averageWindowDays : 0,
      },
      previous: {
        totalListeningSeconds: previous.listeningSeconds,
        totalPlays: previous.plays,
      },
      timeline: timeline.map((bucket) => ({
        date: bucket._id.toISOString(),
        plays: bucket.plays,
        listeningSeconds: bucket.listeningSeconds,
      })),
      topTracks: trackDetails
        .sort((a, b) => b.totals.plays - a.totals.plays || b.totals.listeningSeconds - a.totals.listeningSeconds)
        .slice(0, 10)
        .map(({ track, totals }) => ({
          _id: track._id.toString(),
          title: track.title,
          artist: track.artistIds.map(({ name }) => name).filter(Boolean).join(", ") || "Unknown artist",
          artworkUrl: track.artworkUrl || track.albumId?.artworkUrl || "",
          image: track.artworkUrl || track.albumId?.artworkUrl || "",
          audioUrl: track.audioUrl || "",
          durationSeconds: track.durationSeconds,
          plays: totals.plays,
          listeningSeconds: totals.listeningSeconds,
        })),
      topAlbums: [...albums.values()]
        .sort((a, b) => b.plays - a.plays || b.listeningSeconds - a.listeningSeconds)
        .slice(0, 8)
        .map(({ album, plays: albumPlays, listeningSeconds: albumListeningSeconds }) => ({
          _id: album._id.toString(),
          title: album.title,
          artist: trackDetails.find(({ track }) => track.albumId?._id.equals(album._id))?.track.artistIds
            .map(({ name }) => name).filter(Boolean).join(", ") || "Unknown artist",
          artworkUrl: album.artworkUrl || "",
          image: album.artworkUrl || "",
          plays: albumPlays,
          listeningSeconds: albumListeningSeconds,
        })),
      topArtists: [...artists.values()]
        .sort((a, b) => b.plays - a.plays || b.listeningSeconds - a.listeningSeconds)
        .slice(0, 8)
        .map(({ artist, plays: artistPlays, listeningSeconds: artistListeningSeconds }) => ({
          id: artist._id.toString(),
          name: artist.name,
          imageUrl: artist.imageUrl || "",
          plays: artistPlays,
          listeningSeconds: artistListeningSeconds,
        })),
      topGenres: [...genres.values()]
        .sort((a, b) => b.plays - a.plays || b.listeningSeconds - a.listeningSeconds)
        .slice(0, 8),
      mostActiveDay: mostActiveDay[0]
        ? {
            name: weekdayNames[mostActiveDay[0]._id - 1],
            listeningSeconds: mostActiveDay[0].listeningSeconds,
            plays: mostActiveDay[0].plays,
          }
        : null,
    },
  });
};
