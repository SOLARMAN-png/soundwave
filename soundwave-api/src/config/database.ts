import mongoose from "mongoose";

export async function connectMongoDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not defined");
  }

  await mongoose.connect(uri, { dbName: "soundwave" });
  console.log("MongoDB connected");
}

export async function pingMongoDB() {
  const database = mongoose.connection.db;
  if (!database) {
    throw new Error("MongoDB is not connected");
  }

  await database.command({ ping: 1 });
}