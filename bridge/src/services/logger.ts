// bridge/src/services/logger.ts
import pino from 'pino';
// send logs to stderr by creating destination with { dest: 2 }
const logger = pino({}, pino.destination(2));
export default logger;
