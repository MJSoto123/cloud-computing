import express, { json } from "express";
import mongoose from "mongoose";
import cors from "cors";

const app = express();
app.use(cors());
app.use(json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/myapp";

// Modelo
const Item = mongoose.model("Item", {
  nombre: String,
  costo: Number,
  cantidad: Number,
});

// Probes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

app.get("/ready", (_req, res) => {
  const up = mongoose.connection.readyState === 1; 
  return up ? res.status(200).send("ready") : res.status(503).send("not ready");
});


app.get('/api/data', async (req, res) => {
  res.json({ message: 'Datos desde el backend', items: [] });
});

app.post("/api/items", async (req, res, next) => {
  try {
    const item = new Item(req.body);
    await item.save();
    res.json(item);
  } catch (e) { next(e); }
});

app.get("/api/items", async (_req, res, next) => {
  try {
    const items = await Item.find();
    res.json(items);
  } catch (e) { next(e); }
});

app.delete("/api/items/:id", async (req, res, next) => {
  try {
    await Item.findByIdAndDelete(req.params.id);
    res.json({ message: "Item eliminado" });
  } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

async function start() {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: "db" });

    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`API on http://0.0.0.0:${PORT}`);
    });

    const shutdown = async () => {
      console.log("Shutting down...");
      server.close(async () => {
        try {
          await mongoose.connection.close(false);
        } finally {
          process.exit(0);
        }
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (e) {
    console.error("Mongo connection failed:", e);
    process.exit(1);
  }
}
start();
