import { Schema, model, models, type Model } from "mongoose";

export interface Room {
  id: string;
  code: string;
  hostPlayerId: string;
  maxPlayers: number;
  playerCount: number;
  status: string; // waiting | playing | finished | abandoned | cancelled
  isPrivate: boolean;
  allowBots: boolean;
  botDifficulty: string | null; // easy | medium | hard
  gameStateJson: string | null;
  /** Pre-game seating (JSON array of lobby seats) — persisted so the lobby survives polling/serverless restarts. */
  lobbyJson: string | null;
  /** Optimistic-concurrency counter, incremented on every gameStateJson write — lets concurrent pollers avoid clobbering each other. */
  gameSeq: number;
  /** When MongoDB automatically deletes this document (TTL index below). Refreshed on every meaningful activity while the room's alive; set to "now" the moment it's cancelled/abandoned/finished so it's swept away shortly after. */
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertRoom {
  id: string;
  code: string;
  hostPlayerId: string;
  maxPlayers?: number;
  isPrivate?: boolean;
  allowBots?: boolean;
  botDifficulty?: string | null;
}

/** Shape of the raw Mongo document (uses `_id`, everything else matches `Room`). */
export type RoomRecord = Omit<Room, "id"> & { _id: string };

const roomSchema = new Schema<RoomRecord>(
  {
    _id: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    hostPlayerId: { type: String, required: true },
    maxPlayers: { type: Number, required: true, default: 4 },
    playerCount: { type: Number, required: true, default: 1 },
    status: { type: String, required: true, default: "waiting" },
    isPrivate: { type: Boolean, required: true, default: false },
    allowBots: { type: Boolean, required: true, default: false },
    botDifficulty: { type: String, default: null },
    gameStateJson: { type: String, default: null },
    lobbyJson: { type: String, default: null },
    gameSeq: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
  },
  { timestamps: true, versionKey: false },
);

// TTL index — MongoDB's own background sweep (runs roughly every 60s)
// deletes a document once its expiresAt has passed. This is what actually
// removes cancelled/abandoned/finished rooms, and cleans up any room nobody
// ever touches again, without needing a cron job or server process —
// works identically whether this runs as a long-lived process or a
// stateless Vercel function.
roomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RoomModel: Model<RoomRecord> =
  (models.Room as Model<RoomRecord>) ?? model<RoomRecord>("Room", roomSchema, "rooms");
