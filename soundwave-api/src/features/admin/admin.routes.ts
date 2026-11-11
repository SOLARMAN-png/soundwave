import { Router } from "express";
import { requireAdmin, requireAuth } from "../auth/auth.middleware.js";
import {
  createMediaUploadSignature,
  createAlbum,
  createTrack,
  deleteManagedAlbum,
  deleteManagedTrack,
  getAdminSession,
  listManagedAlbums,
  listManagedTracks,
} from "./admin.controller.js";

const router = Router();

router.use(requireAuth, requireAdmin);
router.get("/me", getAdminSession);
router.get("/tracks", listManagedTracks);
router.get("/albums", listManagedAlbums);
router.post("/uploads/signature", createMediaUploadSignature);
router.post("/tracks", createTrack);
router.post("/albums", createAlbum);
router.delete("/tracks/:id", deleteManagedTrack);
router.delete("/albums/:id", deleteManagedAlbum);

export default router;