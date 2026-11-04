import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { AzureLLMAdapter } from "./llm/azure.js";
import { AgentSession } from "./agent/loop.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(projectRoot, "web")));

// In-memory sessions
const sessions = new Map<string, AgentSession>();

function getOrCreateSession(sessionId: string): AgentSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = new AgentSession(sessionId, projectRoot);
    sessions.set(sessionId, session);
  }
  return session;
}

const adapter = new AzureLLMAdapter();

// Health check endpoint
app.get("/api/health", (_req, res) => {
  const status = adapter.getStatus();
  res.json({
    ok: true,
    provider: status.provider,
    model: status.deployment,
    configured: status.configured,
    timestamp: new Date().toISOString(),
  });
});

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId = `session-${Date.now()}` } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({ ok: false, error: "El campo 'message' es requerido." });
      return;
    }

    const session = getOrCreateSession(sessionId);
    const turnResult = await session.runTurn(message, adapter);

    res.json({
      sessionId,
      reply: turnResult.reply,
      toolCalls: turnResult.toolCalls,
      needsConfirmation: turnResult.needsConfirmation,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Error en /api/chat:", error);
    res.status(500).json({ ok: false, error: errMsg });
  }
});

// Session history endpoint
app.get("/api/sessions/:id", (req, res) => {
  const sessionId = req.params.id;
  const session = sessions.get(sessionId);

  if (!session) {
    res.status(404).json({ ok: false, error: `Sesión '${sessionId}' no encontrada.` });
    return;
  }

  res.json({
    ok: true,
    sessionId: session.id,
    messages: session.messages,
    awaitingConfirmationForCase: session.awaitingConfirmationForCase,
  });
});

app.listen(port, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Servidor Agente Registro Proveedor activo`);
  console.log(`📡 URL local: http://localhost:${port}`);
  console.log(`🔍 Health check: http://localhost:${port}/api/health`);
  console.log(`=======================================================`);
});

