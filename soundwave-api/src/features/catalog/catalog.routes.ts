import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  getAlbum,
  getArtist,
  getPersonalizedTracks,
  getTrack,
  listGenres,
  listAlbums,
  listArtists,
  listTracks,
} from "./catalog.controller.js";

const catalogRouter = Router();

catalogRouter.get("/genres", listGenres);
catalogRouter.get("/recommendations", requireAuth, getPersonalizedTracks);
catalogRouter.get("/tracks", listTracks);
catalogRouter.get("/tracks/:id", getTrack);
catalogRouter.get("/artists", listArtists);
catalogRouter.get("/artists/:id", getArtist);
catalogRouter.get("/albums", listAlbums);
catalogRouter.get("/albums/:id", getAlbum);

export default catalogRouter;
