import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { getListeningAnalytics } from "./analytics.controller.js";

const analyticsRouter = Router();

analyticsRouter.use(requireAuth);
analyticsRouter.get("/", getListeningAnalytics);

export default analyticsRouter;
