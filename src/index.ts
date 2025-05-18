import { MqttServer } from './mqtt/server';
import { DashboardServer } from './dashboard/server';
import { SystemTopicsManager } from './mqtt/system-topics';
import logger from './utils/logger';
import { config } from './config';
import { initializeDatabase } from './utils/database';
import 'reflect-metadata';

// Initialize the database first
async function initialize() {
  try {
    // Initialize database
    logger.info('Initializing database...');
    const dbInitialized = await initializeDatabase();
    
    if (!dbInitialized) {
      logger.error('Failed to initialize database. Exiting...');
      process.exit(1);
    }
    
    logger.info('Database initialized successfully');
    
    // Create and start servers
    startServers();
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Initialization error: ${error.message}`);
      logger.error(error.stack);
    } else {
      logger.error('Unknown initialization error');
    }
    process.exit(1);
  }
}

// Create and start all server components
function startServers() {
  // Create the MQTT server
  const mqttServer = new MqttServer();

  // Create the Dashboard server (default port 3000)
  const dashboardServer = new DashboardServer(config.dashboard.port, mqttServer);

  // Create the System Topics Manager
  const systemTopicsManager = new SystemTopicsManager();

  // Handle process events for graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Received SIGINT signal, shutting down...');
    mqttServer.stop();
    dashboardServer.stop();
    systemTopicsManager.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM signal, shutting down...');
    mqttServer.stop();
    dashboardServer.stop();
    systemTopicsManager.stop();
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception: ${error.message}`);
    logger.error(error.stack);
    mqttServer.stop();
    dashboardServer.stop();
    systemTopicsManager.stop();
    process.exit(1);
  });

  // Start the servers
  try {
    logger.info('Starting MQTT server...');
    mqttServer.start();
    
    logger.info('Starting Dashboard server...');
    dashboardServer.start();
    
    logger.info('Starting System Topics Manager...');
    systemTopicsManager.start().catch(err => {
      logger.error(`Failed to start System Topics Manager: ${err.message}`);
    });
    
    logger.info(`Dashboard available at http://localhost:${config.dashboard.port}`);
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Failed to start servers: ${error.message}`);
      logger.error(error.stack);
    } else {
      logger.error('Failed to start servers with unknown error');
    }
    process.exit(1);
  }
}

// Start the application
initialize(); 