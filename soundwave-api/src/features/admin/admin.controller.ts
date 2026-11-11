import type { RequestHandler } from "express";
import mongoose from "mongoose";
import { createUploadSignature, deleteMedia, inspectMedia } from "../../config/cloudinary.js";
import {
  AlbumModel,
  ArtistModel,
  LikeModel,
  PlaybackEventModel,
  PlaylistModel,
  PlaylistTrackModel,
  TrackModel,
} from "../../models/index.js";
import { createAlbumSchema, createTrackSchema, uploadSignatureSchema } from "./admin.validation.js";

function belongsToConfiguredCloudinary(url: string, publicId: string, folder: string) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return false;

  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.hostname === "res.cloudinary.com" &&
      parsedUrl.pathname.startsWith(`/${cloudName}/`) &&
      publicId.startsWith(`${folder}/`)
    );
  } catch {
    return false;
  }
}

type CatalogMedia = { publicId: string; resourceType: "image" | "video"; url?: string | undefined };

async function findUnreferencedMedia(
  trackIds: mongoose.Types.ObjectId[],
  albumIds: mongoose.Types.ObjectId[],
  candidates: CatalogMedia[],
) {
  const uniqueCandidates = [...new Map(
    candidates
      .filter(({ publicId, resourceType }) =>
        resourceType === "image"
          ? publicId.startsWith("soundwave/covers/")
          : publicId.startsWith("soundwave/audio/"),
      )
      .map((media) => [`${media.resourceType}:${media.publicId}`, media]),
  ).values()];

  const removable: CatalogMedia[] = [];
  for (const media of uniqueCandidates) {
    const urlReference = media.url ? [{ [media.resourceType === "video" ? "audioUrl" : "artworkUrl"]: media.url }] : [];
    const references = media.resourceType === "video"
      ? [await TrackModel.exists({
          _id: { $nin: trackIds },
          $or: [{ audioPublicId: media.publicId }, ...urlReference],
        })]
      : await Promise.all([
          TrackModel.exists({
            _id: { $nin: trackIds },
            $or: [{ artworkPublicId: media.publicId }, ...urlReference],
          }),
          AlbumModel.exists({
            _id: { $nin: albumIds },
            $or: [{ artworkPublicId: media.publicId }, ...urlReference],
          }),
        ]);
    if (references.every((reference) => !reference)) removable.push(media);
  }

  return removable;
}

async function deleteCloudinaryAssets(media: CatalogMedia[]) {
  const results = await Promise.allSettled(
    media.map(({ publicId, resourceType }) => deleteMedia(publicId, resourceType)),
  );
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Could not remove all catalog media from Cloudinary");
  }
}

async function deleteCatalogRecords(
  trackIds: mongoose.Types.ObjectId[],
  albumIds: mongoose.Types.ObjectId[],
) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (trackIds.length) {
        const playlistEntries = await PlaylistTrackModel.find({ trackId: { $in: trackIds } })
          .select("playlistId")
          .session(session)
          .lean()
          .exec();
        const playlistIds = [...new Set(playlistEntries.map((entry) => entry.playlistId.toString()))]
          .map((id) => new mongoose.Types.ObjectId(id));

        await PlaylistTrackModel.deleteMany({ trackId: { $in: trackIds } }).session(session).exec();
        for (const playlistId of playlistIds) {
          const remainingEntries = await PlaylistTrackModel.find({ playlistId })
            .sort({ position: 1 })
            .session(session)
            .exec();

          for (const [index, entry] of remainingEntries.entries()) {
            await PlaylistTrackModel.updateOne(
              { _id: entry._id },
              { $set: { position: -(index + 1) } },
              { session },
            ).exec();
          }
          for (const [position, entry] of remainingEntries.entries()) {
            await PlaylistTrackModel.updateOne(
              { _id: entry._id },
              { $set: { position } },
              { session, runValidators: true },
            ).exec();
          }
          await PlaylistModel.updateOne(
            { _id: playlistId },
            { $set: { updatedAt: new Date() } },
          ).session(session).exec();
        }

        await LikeModel.deleteMany({ trackId: { $in: trackIds } }).session(session).exec();
      }

      if (trackIds.length) {
        await PlaybackEventModel.deleteMany({ trackId: { $in: trackIds } }).session(session).exec();
      }
      if (albumIds.length) {
        await PlaybackEventModel.deleteMany({
          contextType: "album",
          contextId: { $in: albumIds },
        }).session(session).exec();
      }
      if (trackIds.length) {
        await TrackModel.deleteMany({ _id: { $in: trackIds } }).session(session).exec();
      }
      if (albumIds.length) {
        await AlbumModel.deleteMany({ _id: { $in: albumIds } }).session(session).exec();
      }
    });
  } finally {
    await session.endSession();
  }
}

export const getAdminSession: RequestHandler = (request, response) => {
  response.status(200).json({ data: request.authenticatedUser });
};

export const listManagedTracks: RequestHandler = async (_request, response) => {
  const tracks = await TrackModel.find()
    .select("title artistIds albumId durationSeconds explicit genre audioUrl artworkUrl published createdAt")
    .populate({ path: "artistIds", select: "name" })
    .populate({ path: "albumId", select: "title" })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()
    .exec();

  response.status(200).json({ data: tracks });
};

export const listManagedAlbums: RequestHandler = async (_request, response) => {
  const albums = await AlbumModel.find()
    .select("title artistIds releaseDate artworkUrl createdAt")
    .populate({ path: "artistIds", select: "name" })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()
    .exec();

  response.status(200).json({ data: albums });
};

export const deleteManagedTrack: RequestHandler = async (request, response) => {
  const id = request.params.id;
  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    response.status(400).json({ error: "Invalid track ID" });
    return;
  }

  const trackId = new mongoose.Types.ObjectId(id);
  const track = await TrackModel.findById(trackId)
    .select("albumId audioUrl audioPublicId artworkUrl artworkPublicId")
    .lean()
    .exec();
  if (!track) {
    response.status(404).json({ error: "Track not found" });
    return;
  }

  const trackIds = [trackId];
  const albumIds = track.albumId && !(await TrackModel.exists({ albumId: track.albumId, _id: { $ne: trackId } }))
    ? [track.albumId]
    : [];
  const emptyAlbum = albumIds.length
    ? await AlbumModel.findById(albumIds[0]).select("artworkUrl artworkPublicId").lean().exec()
    : null;
  const media = await findUnreferencedMedia(trackIds, albumIds, [
    ...(track.audioPublicId ? [{ publicId: track.audioPublicId, resourceType: "video" as const, url: track.audioUrl }] : []),
    ...(track.artworkPublicId ? [{ publicId: track.artworkPublicId, resourceType: "image" as const, url: track.artworkUrl }] : []),
    ...(emptyAlbum?.artworkPublicId
      ? [{ publicId: emptyAlbum.artworkPublicId, resourceType: "image" as const, url: emptyAlbum.artworkUrl }]
      : []),
  ]);
  try {
    await deleteCloudinaryAssets(media);
    await deleteCatalogRecords(trackIds, albumIds);
  } catch (error: unknown) {
    console.error("Could not fully delete catalog track", error);
    response.status(502).json({ error: "Track deletion did not complete. Retry the deletion." });
    return;
  }

  response.status(204).end();
};

export const deleteManagedAlbum: RequestHandler = async (request, response) => {
  const id = request.params.id;
  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    response.status(400).json({ error: "Invalid album ID" });
    return;
  }

  const albumId = new mongoose.Types.ObjectId(id);
  const album = await AlbumModel.findById(albumId)
    .select("artworkUrl artworkPublicId")
    .lean()
    .exec();
  if (!album) {
    response.status(404).json({ error: "Album not found" });
    return;
  }

  const albumTracks = await TrackModel.find({ albumId })
    .select("_id audioUrl audioPublicId artworkUrl artworkPublicId")
    .lean()
    .exec();
  const trackIds = albumTracks.map((track) => track._id);
  const media = await findUnreferencedMedia(trackIds, [albumId], [
    ...(album.artworkPublicId ? [{ publicId: album.artworkPublicId, resourceType: "image" as const, url: album.artworkUrl }] : []),
    ...albumTracks.flatMap((track) => [
      ...(track.audioPublicId ? [{ publicId: track.audioPublicId, resourceType: "video" as const, url: track.audioUrl }] : []),
      ...(track.artworkPublicId ? [{ publicId: track.artworkPublicId, resourceType: "image" as const, url: track.artworkUrl }] : []),
    ]),
  ]);
  try {
    await deleteCloudinaryAssets(media);
    await deleteCatalogRecords(trackIds, [albumId]);
  } catch (error: unknown) {
    console.error("Could not fully delete catalog album", error);
    response.status(502).json({ error: "Album deletion did not complete. Retry the deletion." });
    return;
  }

  response.status(204).end();
};

export const createMediaUploadSignature: RequestHandler = (request, response) => {
  const parsed = uploadSignatureSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Choose audio or artwork media" });
    return;
  }

  response.status(200).json({
    data: createUploadSignature(parsed.data.mediaType === "audio" ? "video" : "image"),
  });
};

export const createTrack: RequestHandler = async (request, response) => {
  const parsed = createTrackSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid track details",
      details: parsed.error.issues.map(({ path, message }) => ({ path, message })),
    });
    return;
  }

  if (
    !belongsToConfiguredCloudinary(parsed.data.audioUrl, parsed.data.audioPublicId, "soundwave/audio") ||
    !belongsToConfiguredCloudinary(parsed.data.artworkUrl, parsed.data.artworkPublicId, "soundwave/covers")
  ) {
    response.status(400).json({ error: "Media must be uploaded to this Soundwave Cloudinary account" });
    return;
  }

  let audio: Awaited<ReturnType<typeof inspectMedia>>;
  let artwork: Awaited<ReturnType<typeof inspectMedia>>;
  try {
    [audio, artwork] = await Promise.all([
      inspectMedia(parsed.data.audioPublicId, "video"),
      inspectMedia(parsed.data.artworkPublicId, "image"),
    ]);
  } catch {
    response.status(400).json({ error: "Uploaded media could not be verified in Cloudinary" });
    return;
  }

  const audioFormats = new Set(["aac", "flac", "m4a", "mp3", "ogg", "wav"]);
  const artworkFormats = new Set(["avif", "jpg", "jpeg", "png", "webp"]);
  if (
    audio.url !== parsed.data.audioUrl ||
    artwork.url !== parsed.data.artworkUrl ||
    !audioFormats.has(audio.format.toLowerCase()) ||
    !artworkFormats.has(artwork.format.toLowerCase()) ||
    audio.bytes > 100 * 1024 * 1024 ||
    artwork.bytes > 8 * 1024 * 1024
  ) {
    response.status(400).json({ error: "Uploaded media type or file size is not supported" });
    return;
  }

  try {
    let artist = await ArtistModel.findOne({ name: parsed.data.artist }).exec();
    if (!artist) {
      artist = await ArtistModel.create({ name: parsed.data.artist, imageUrl: parsed.data.artworkUrl });
    }

    let album = await AlbumModel.findOne({ title: parsed.data.album, artistIds: artist._id }).exec();
    if (!album) {
      album = await AlbumModel.create({
        title: parsed.data.album,
        artistIds: [artist._id],
        artworkUrl: parsed.data.artworkUrl,
      });
    }

    const track = await TrackModel.create({
      title: parsed.data.title,
      artistIds: [artist._id],
      albumId: album._id,
      durationSeconds: parsed.data.durationSeconds,
      explicit: parsed.data.explicit,
      genre: parsed.data.genre,
      audioUrl: parsed.data.audioUrl,
      audioPublicId: parsed.data.audioPublicId,
      artworkUrl: parsed.data.artworkUrl,
      artworkPublicId: parsed.data.artworkPublicId,
      published: true,
    });

    response.status(201).json({ data: track });
  } catch (error: unknown) {
    await Promise.allSettled([
      deleteMedia(parsed.data.audioPublicId, "video"),
      deleteMedia(parsed.data.artworkPublicId, "image"),
    ]);

    if (error instanceof mongoose.Error.ValidationError) {
      response.status(400).json({ error: "Track metadata did not pass validation" });
      return;
    }

    throw error;
  }
};

export const createAlbum: RequestHandler = async (request, response) => {
  const parsed = createAlbumSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid album details",
      details: parsed.error.issues.map(({ path, message }) => ({ path, message })),
    });
    return;
  }

  const { artworkUrl, artworkPublicId, tracks } = parsed.data;
  const ownedMedia = [
    { url: artworkUrl, publicId: artworkPublicId, folder: "soundwave/covers", resourceType: "image" as const },
    ...tracks.map((item) => ({
      url: item.audioUrl,
      publicId: item.audioPublicId,
      folder: "soundwave/audio",
      resourceType: "video" as const,
    })),
  ];

  if (ownedMedia.some(({ url, publicId, folder }) => !belongsToConfiguredCloudinary(url, publicId, folder))) {
    response.status(400).json({ error: "Album media must be uploaded to this Soundwave Cloudinary account" });
    return;
  }

  const cleanupUploadedMedia = () => Promise.allSettled(
    ownedMedia.map(({ publicId, resourceType }) => deleteMedia(publicId, resourceType)),
  );

  let verifiedMedia: Awaited<ReturnType<typeof inspectMedia>>[];
  try {
    verifiedMedia = await Promise.all(ownedMedia.map(({ publicId, resourceType }) => inspectMedia(publicId, resourceType)));
  } catch {
    await cleanupUploadedMedia();
    response.status(400).json({ error: "One or more album files could not be verified in Cloudinary" });
    return;
  }

  const artwork = verifiedMedia.at(0);
  const audioAssets = verifiedMedia.slice(1);
  const artworkFormats = new Set(["avif", "jpg", "jpeg", "png", "webp"]);
  const audioFormats = new Set(["aac", "flac", "m4a", "mp3", "ogg", "wav"]);
  const validArtwork = Boolean(artwork &&
    artwork.url === artworkUrl &&
    artworkFormats.has(artwork.format.toLowerCase()) &&
    artwork.bytes <= 8 * 1024 * 1024);
  const validAudio = audioAssets.length === tracks.length && audioAssets.every((asset, index) => {
    const track = tracks[index];
    return Boolean(track &&
      asset.url === track.audioUrl &&
      audioFormats.has(asset.format.toLowerCase()) &&
      asset.bytes <= 100 * 1024 * 1024);
  });
  if (!validArtwork || !validAudio) {
    await cleanupUploadedMedia();
    response.status(400).json({ error: "Album artwork or audio files have an unsupported type or size" });
    return;
  }

  let albumId: typeof AlbumModel.prototype._id | undefined;
  try {
    let artist = await ArtistModel.findOne({ name: parsed.data.artist }).exec();
    if (!artist) {
      artist = await ArtistModel.create({ name: parsed.data.artist, imageUrl: artworkUrl });
    }

    const existingAlbum = await AlbumModel.findOne({ title: parsed.data.title, artistIds: artist._id })
      .select("_id")
      .lean()
      .exec();
    if (existingAlbum) {
      await cleanupUploadedMedia();
      response.status(409).json({ error: "An album with this title already exists for this artist" });
      return;
    }

    const album = await AlbumModel.create({
      title: parsed.data.title,
      artistIds: [artist._id],
      ...(parsed.data.releaseDate
        ? { releaseDate: new Date(`${parsed.data.releaseDate}T00:00:00.000Z`) }
        : {}),
      artworkUrl,
      artworkPublicId,
    });
    albumId = album._id;

    await TrackModel.insertMany(tracks.map((item, index) => ({
      title: item.title,
      artistIds: [artist._id],
      albumId: album._id,
      trackNumber: index + 1,
      durationSeconds: item.durationSeconds,
      explicit: item.explicit,
      genre: item.genre,
      audioUrl: item.audioUrl,
      audioPublicId: item.audioPublicId,
      artworkUrl,
      artworkPublicId,
      published: true,
    })));

    response.status(201).json({ data: album });
  } catch (error: unknown) {
    if (albumId) {
      await Promise.allSettled([
        TrackModel.deleteMany({ albumId }).exec(),
        AlbumModel.deleteOne({ _id: albumId }).exec(),
      ]);
    }
    await cleanupUploadedMedia();

    if (error instanceof mongoose.Error.ValidationError) {
      response.status(400).json({ error: "Album or track metadata did not pass validation" });
      return;
    }

    throw error;
  }
};