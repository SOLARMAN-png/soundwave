import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  addTrackToPlaylist,
  createPlaylist,
  getPlaylist,
  listPlaylists,
  removeTrackFromPlaylist,
  reorderPlaylistTracks,
  updatePlaylist,
} from "./playlist.controller.js";

const playlistRouter = Router();

playlistRouter.use(requireAuth);
playlistRouter.post("/", createPlaylist);
playlistRouter.get("/", listPlaylists);
playlistRouter.get("/:id", getPlaylist);
playlistRouter.patch("/:id", updatePlaylist);
playlistRouter.post("/:id/tracks", addTrackToPlaylist);
playlistRouter.patch("/:id/tracks/order", reorderPlaylistTracks);
playlistRouter.delete("/:id/tracks/:trackId", removeTrackFromPlaylist);

export default playlistRouter;
