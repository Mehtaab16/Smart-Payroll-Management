import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });
if (!process.env.OPENAI_API_KEY) {
    dotenv.config({ path: path.join(__dirname, "..", ".env") });
}

console.log("Loaded OPENAI_API_KEY?", !!process.env.OPENAI_API_KEY);

await import("./app.js");
