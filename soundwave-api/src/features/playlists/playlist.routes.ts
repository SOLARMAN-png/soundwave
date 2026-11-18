import { Router } from "express";
import { optionalAuth, requireAuth } from "../auth/auth.middleware.js";
import {
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  removeTrackFromPlaylist,
  reorderPlaylistTracks,
  updatePlaylist,
} from "./playlist.controller.js";

const playlistRouter = Router();

playlistRouter.post("/", requireAuth, createPlaylist);
playlistRouter.get("/", requireAuth, listPlaylists);
playlistRouter.get("/:id", optionalAuth, getPlaylist);
playlistRouter.patch("/:id", requireAuth, updatePlaylist);
playlistRouter.delete("/:id", requireAuth, deletePlaylist);
playlistRouter.post("/:id/tracks", requireAuth, addTrackToPlaylist);
playlistRouter.patch("/:id/tracks/order", requireAuth, reorderPlaylistTracks);
playlistRouter.delete("/:id/tracks/:trackId", requireAuth, removeTrackFromPlaylist);

export default playlistRouter;
