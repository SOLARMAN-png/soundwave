import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  deletePlaybackHistoryEntry,
  listPlaybackHistory,
  recordPlayback,
} from "./playback.controller.js";

const playbackRouter = Router();

playbackRouter.use(requireAuth);
playbackRouter.post("/", recordPlayback);
playbackRouter.get("/", listPlaybackHistory);
playbackRouter.delete("/:id", deletePlaybackHistoryEntry);

export default playbackRouter;
