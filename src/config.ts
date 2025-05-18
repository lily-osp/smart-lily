import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({
  path: path.resolve(__dirname, '../config/default.env'),
});

// Server configuration
export const config = {
  mqtt: {
    port: parseInt(process.env.MQTT_PORT || '1883', 10),
    wsPort: parseInt(process.env.MQTT_WS_PORT || '8883', 10),
    host: process.env.HOST || '0.0.0.0',
  },
  dashboard: {
    port: parseInt(process.env.DASHBOARD_PORT || '3000', 10),
  },
  logger: {
    level: process.env.LOG_LEVEL || 'debug',
  },
  apis: {
    weather: {
      apiKey: process.env.WEATHER_API_KEY || '',
      location: process.env.WEATHER_LOCATION || 'London,uk',
    },
    news: {
      apiKey: process.env.NEWS_API_KEY || '',
      country: process.env.NEWS_COUNTRY || 'us',
    }
  },
  system: {
    updateIntervals: {
      time: parseInt(process.env.UPDATE_INTERVAL_TIME || '5000', 10), // 5 seconds
      system: parseInt(process.env.UPDATE_INTERVAL_SYSTEM || '5000', 10), // 5 seconds
      weather: parseInt(process.env.UPDATE_INTERVAL_WEATHER || '1800000', 10), // 30 minutes
      news: parseInt(process.env.UPDATE_INTERVAL_NEWS || '3600000', 10), // 1 hour
      crypto: parseInt(process.env.UPDATE_INTERVAL_CRYPTO || '900000', 10), // 15 minutes
    }
  },
}; 