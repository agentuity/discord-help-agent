import { createApp } from "@agentuity/runtime";
import { initializeGateway } from "./src/gateway/instance";

const { server, logger, router } = await createApp();

// Initialize Discord Gateway on startup
const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
	logger.error("DISCORD_BOT_TOKEN not set, Discord Gateway not initialized");
	process.exit(1);
}

initializeGateway(token, router, logger);

logger.debug("Running %s", server.url);
