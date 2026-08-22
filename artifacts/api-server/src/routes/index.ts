import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import playersRouter from "./players.js";
import roomsRouter from "./rooms.js";
import leaderboardRouter from "./leaderboard.js";
import authRouter from "./auth.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(playersRouter);
router.use(roomsRouter);
router.use(leaderboardRouter);

export default router;
