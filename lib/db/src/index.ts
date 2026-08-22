import mongoose from "mongoose";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database? (e.g. mongodb://localhost:27017/ludo)",
  );
}

mongoose.set("strictQuery", true);

let connectPromise: Promise<typeof mongoose> | null = null;

/** Connects to MongoDB (idempotent — safe to call multiple times, including
 * once per serverless invocation: the cached promise is reused for the
 * lifetime of the module, i.e. for every request a warm function instance
 * handles). maxPoolSize is capped so a burst of concurrent cold starts on a
 * serverless platform can't exhaust MongoDB Atlas's free-tier connection
 * limit — plenty for a single long-running process too. */
export function connectDb(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose);
  if (!connectPromise) {
    connectPromise = mongoose
      .connect(process.env.DATABASE_URL as string, {
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 10000,
      })
      .catch((err) => {
        // A failed connection must not poison a warm serverless instance
        // forever; allow the next request to retry.
        connectPromise = null;
        throw err;
      });
  }
  return connectPromise;
}

export { mongoose };

export * from "./schema/index.js";

/**
 * Mongo documents use `_id` as their string primary key (set explicitly to
 * an app-generated UUID). Every route in this app expects an `id` field
 * instead (this mirrors the previous Drizzle/Postgres shape), so lean
 * query results are passed through this helper before being sent back.
 */
export function withId<T extends { _id: string }>(doc: T): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, "_id"> & { id: string };
}
