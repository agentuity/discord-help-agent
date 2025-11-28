import { createApp } from '@agentuity/runtime';
import { initializeGateway } from './src/apis/status/instance';

const { server, logger, router } = createApp();

// Initialize Discord Gateway on startup
const token = process.env.DISCORD_BOT_TOKEN;
if (token) {
  initializeGateway(token, router, logger);
  logger.info('Discord Gateway initialized');
} else {
  logger.warn('DISCORD_BOT_TOKEN not set, Discord Gateway not initialized');
}

logger.debug('Running %s', server.url);