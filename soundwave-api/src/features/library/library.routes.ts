import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  followArtist,
  clearLikedTracks,
  createLikedTracksSharePlaylist,
  likeTrack,
  listFollowedArtists,
  listLikedTracks,
  unfollowArtist,
  unlikeTrack,
} from "./library.controller.js";

const libraryRouter = Router();

libraryRouter.use(requireAuth);
libraryRouter.get("/tracks", listLikedTracks);
libraryRouter.post("/tracks/share", createLikedTracksSharePlaylist);
libraryRouter.delete("/tracks", clearLikedTracks);
libraryRouter.put("/tracks/:trackId", likeTrack);
libraryRouter.delete("/tracks/:trackId", unlikeTrack);
libraryRouter.get("/artists", listFollowedArtists);
libraryRouter.put("/artists/:artistId", followArtist);
libraryRouter.delete("/artists/:artistId", unfollowArtist);

export default libraryRouter;
