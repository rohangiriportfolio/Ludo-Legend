import { Schema, model, models, type Model } from "mongoose";

export interface GameRecord {
  id: string;
  roomCode: string;
  playerCount: number;
  winnerId: string;
  rankingsJson: string; // serialized [{playerId, rank}]
  playedAt: Date;
}

export interface InsertGameRecord {
  id: string;
  roomCode: string;
  playerCount: number;
  winnerId: string;
  rankingsJson: string;
  playedAt: Date;
}

/** Shape of the raw Mongo document (uses `_id`, everything else matches `GameRecord`). */
export type GameRecordRecord = Omit<GameRecord, "id"> & { _id: string };

const gameRecordSchema = new Schema<GameRecordRecord>(
  {
    _id: { type: String, required: true },
    roomCode: { type: String, required: true },
    playerCount: { type: Number, required: true },
    winnerId: { type: String, required: true },
    rankingsJson: { type: String, required: true, default: "[]" },
    playedAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);

export const GameRecordModel: Model<GameRecordRecord> =
  (models.GameRecord as Model<GameRecordRecord>) ?? model<GameRecordRecord>("GameRecord", gameRecordSchema, "game_records");
