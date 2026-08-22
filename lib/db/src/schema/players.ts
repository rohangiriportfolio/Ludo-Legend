import { Schema, model, models, type Model } from "mongoose";

export interface Player {
  id: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string | null;
  gamesPlayed: number;
  gamesWon: number;
  totalTokensHome: number;
  totalTokensCut: number;
  longestWinStreak: number;
  currentWinStreak: number;
  /** "google" for accounts created via Google Sign-In, "guest" for legacy/anonymous rows. */
  authProvider: string;
  /** Google's stable account id ("sub" claim). Unique + sparse so guest rows (null) don't collide. */
  googleId: string | null;
  email: string | null;
  avatarUrl: string | null;
  /** Serialized snapshot of an in-progress match this account can resume (offline or online). Null when none. */
  unfinishedMatchJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertPlayer {
  id: string;
  name: string;
  avatarColor?: string;
  avatarEmoji?: string | null;
  authProvider?: string;
  googleId?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}

/** Shape of the raw Mongo document (uses `_id`, everything else matches `Player`). */
export type PlayerRecord = Omit<Player, "id"> & { _id: string };

const playerSchema = new Schema<PlayerRecord>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    avatarColor: { type: String, required: true, default: "red" },
    avatarEmoji: { type: String, default: null },
    gamesPlayed: { type: Number, required: true, default: 0 },
    gamesWon: { type: Number, required: true, default: 0 },
    totalTokensHome: { type: Number, required: true, default: 0 },
    totalTokensCut: { type: Number, required: true, default: 0 },
    longestWinStreak: { type: Number, required: true, default: 0 },
    currentWinStreak: { type: Number, required: true, default: 0 },
    authProvider: { type: String, required: true, default: "guest" },
    googleId: { type: String, default: null, unique: true, sparse: true },
    email: { type: String, default: null },
    avatarUrl: { type: String, default: null },
    unfinishedMatchJson: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

export const PlayerModel: Model<PlayerRecord> =
  (models.Player as Model<PlayerRecord>) ?? model<PlayerRecord>("Player", playerSchema, "players");
