// Vercel serverless entry point. Wraps the same Express app used for local
// development and every other deployment target — no route or business
// logic is duplicated or reimplemented here.
import type { IncomingMessage, ServerResponse } from "node:http";
import { app } from "../server/src/index";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
