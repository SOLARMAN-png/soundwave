import type { RequestHandler } from "express";
import { AlbumModel, ArtistModel, TrackModel, UserModel } from "../../models/index.js";
import { catalogIdSchema, catalogListQuerySchema } from "./catalog.validation.js";

function parseListQuery(input: unknown, response: Parameters<RequestHandler>[1]) {
  const result = catalogListQuerySchema.safeParse(input);
  if (!result.success) {
    response.status(400).json({
      error: "Invalid query parameters",
      details: result.error.issues.map(({ path, message }) => ({ path, message })),
    });
    return null;
  }

  return result.data;
}

function parseId(input: unknown, response: Parameters<RequestHandler>[1]) {
  const result = catalogIdSchema.safeParse(input);
  if (!result.success) {
    response.status(400).json({ error: "Invalid ID" });
    return null;
  }

  return result.data;
}

function pageInfo(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

export const listTracks: RequestHandler = async (request, response) => {
  const query = parseListQuery(request.query, response);
  if (!query) return;

  const filter = query.q
    ? { published: { $ne: false }, $text: { $search: query.q } }
    : { published: { $ne: false } };
  const [tracks, total] = await Promise.all([
    TrackModel.find(filter)
      .select(
        "title artistIds albumId durationSeconds explicit genre audioUrl artworkUrl previewUrl createdAt updatedAt",
      )
      .populate({ path: "artistIds", select: "name imageUrl" })
      .populate({ path: "albumId", select: "title artworkUrl releaseDate" })
      .sort(query.q ? { score: { $meta: "textScore" } } : { createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean()
      .exec(),
    TrackModel.countDocuments(filter).exec(),
  ]);

  response.status(200).json({
    data: tracks,
    pagination: pageInfo(query.page, query.limit, total),
  });
};

export const listGenres: RequestHandler = async (_request, response) => {
  const genres = await TrackModel.distinct("genre", { published: true }).exec();
  const availableGenres = [...new Set(
    genres
      .filter((genre): genre is string => typeof genre === "string")
      .map((genre) => genre.trim())
      .filter(Boolean),
  )].sort((first, second) => first.localeCompare(second, undefined, { sensitivity: "base" }));

  response.status(200).json({ data: availableGenres });
};

export const getPersonalizedTracks: RequestHandler = async (request, response) => {
  const userId = request.authenticatedUser?.id;
  if (!userId) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  const user = await UserModel.findOne({ _id: userId, status: "active" })
    .select("preferences.genres preferences.artistIds")
    .lean()
    .exec();
  if (!user) {
    response.status(404).json({ error: "Active user not found" });
    return;
  }

  const genres = user.preferences?.genres.map((genre) => genre.trim().toLowerCase()) ?? [];
  const artistIds = user.preferences?.artistIds ?? [];
  const matchingPreferences = [];
  if (genres.length) {
    matchingPreferences.push({
      $expr: {
        $in: [{ $toLower: { $trim: { input: "$genre" } } }, genres],
      },
    });
  }
  if (artistIds.length) matchingPreferences.push({ artistIds: { $in: artistIds } });

  if (!matchingPreferences.length) {
    response.status(200).json({ data: [] });
    return;
  }

  const tracks = await TrackModel.aggregate([
    { $match: { published: { $ne: false }, $or: matchingPreferences } },
    { $sample: { size: 3 } },
    {
      $project: {
        _id: 1,
        title: 1,
        artistIds: 1,
        albumId: 1,
        durationSeconds: 1,
        explicit: 1,
        genre: 1,
        audioUrl: 1,
        artworkUrl: 1,
        previewUrl: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ]).exec();
  const populatedTracks = await TrackModel.populate(tracks, [
    { path: "artistIds", select: "name imageUrl" },
    { path: "albumId", select: "title artworkUrl releaseDate" },
  ]);

  response.status(200).json({ data: populatedTracks });
};

export const getTrack: RequestHandler = async (request, response) => {
  const id = parseId(request.params.id, response);
  if (!id) return;

  const track = await TrackModel.findOne({ _id: id, published: { $ne: false } })
    .select(
      "title artistIds albumId durationSeconds explicit genre audioUrl artworkUrl previewUrl createdAt updatedAt",
    )
    .populate({ path: "artistIds", select: "name bio imageUrl" })
    .populate({
      path: "albumId",
      select: "title artistIds releaseDate artworkUrl",
      populate: { path: "artistIds", select: "name imageUrl" },
    })
    .lean()
    .exec();

  if (!track) {
    response.status(404).json({ error: "Track not found" });
    return;
  }

  response.status(200).json({ data: track });
};

export const listArtists: RequestHandler = async (request, response) => {
  const query = parseListQuery(request.query, response);
  if (!query) return;

  const filter = query.q ? { $text: { $search: query.q } } : {};
  const [artists, total] = await Promise.all([
    ArtistModel.find(filter)
      .select("name bio imageUrl createdAt updatedAt")
      .sort(query.q ? { score: { $meta: "textScore" } } : { name: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean()
      .exec(),
    ArtistModel.countDocuments(filter).exec(),
  ]);

  response.status(200).json({
    data: artists,
    pagination: pageInfo(query.page, query.limit, total),
  });
};

export const getArtist: RequestHandler = async (request, response) => {
  const id = parseId(request.params.id, response);
  if (!id) return;

  const artist = await ArtistModel.findById(id)
    .select("name bio imageUrl createdAt updatedAt")
    .lean()
    .exec();

  if (!artist) {
    response.status(404).json({ error: "Artist not found" });
    return;
  }

  response.status(200).json({ data: artist });
};

export const listAlbums: RequestHandler = async (request, response) => {
  const query = parseListQuery(request.query, response);
  if (!query) return;

  const filter = query.q ? { $text: { $search: query.q } } : {};
  const [albums, total] = await Promise.all([
    AlbumModel.find(filter)
      .select("title artistIds releaseDate artworkUrl createdAt updatedAt")
      .populate({ path: "artistIds", select: "name imageUrl" })
      .sort(query.q
        ? { score: { $meta: "textScore" } }
        : query.sort === "recent"
          ? { createdAt: -1 }
          : { releaseDate: -1, title: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean()
      .exec(),
    AlbumModel.countDocuments(filter).exec(),
  ]);

  response.status(200).json({
    data: albums,
    pagination: pageInfo(query.page, query.limit, total),
  });
};

export const getAlbum: RequestHandler = async (request, response) => {
  const id = parseId(request.params.id, response);
  if (!id) return;

  const [album, tracks] = await Promise.all([
    AlbumModel.findById(id)
      .select("title artistIds releaseDate artworkUrl createdAt updatedAt")
      .populate({ path: "artistIds", select: "name bio imageUrl" })
      .lean()
      .exec(),
    TrackModel.find({ albumId: id, published: { $ne: false } })
      .select("title artistIds albumId trackNumber durationSeconds explicit genre audioUrl artworkUrl createdAt")
      .populate({ path: "artistIds", select: "name imageUrl" })
      .sort({ trackNumber: 1, createdAt: 1 })
      .lean()
      .exec(),
  ]);

  if (!album) {
    response.status(404).json({ error: "Album not found" });
    return;
  }

  response.status(200).json({ data: { ...album, tracks } });
};
