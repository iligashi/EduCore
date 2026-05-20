import mongoose from "mongoose";
import { env } from "../config/env.js";

export async function connectMongo() {
  await mongoose.connect(env.MONGO_URI);
}

export async function disconnectMongo() {
  await mongoose.disconnect();
}

