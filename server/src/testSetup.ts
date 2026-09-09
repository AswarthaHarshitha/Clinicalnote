import dotenv from "dotenv";
import path from "node:path";

// Point the test run at the isolated test database and unconfigured (empty)
// provider keys — tests exercise the real "not configured" error paths
// rather than mocking provider responses, in keeping with the no-fake-data
// principle for anything that touches transcription or SOAP generation.
dotenv.config({ path: path.resolve(__dirname, "../.env.test"), override: true });
