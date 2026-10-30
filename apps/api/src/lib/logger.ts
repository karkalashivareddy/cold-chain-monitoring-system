import pino from "pino";
import { env } from "../config/env";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "frostguard-api" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-device-key']",
      "res.headers['set-cookie']",
      "*.password",
      "*.passwordHash",
      "*.refreshToken",
      "*.accessToken",
      "*.apiKey",
    ],
    censor: "[REDACTED]",
  },
  transport: env.isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
      },
});
