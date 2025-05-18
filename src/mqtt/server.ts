import aedes from 'aedes';
import { createServer } from 'net';
import { createServer as createWebSocketServer } from 'http';
import ws from 'websocket-stream';
import logger from '../utils/logger';
import { config } from '../config';

export class MqttServer {
  private broker: any;
  private server: any;
  private wsServer: any;

  constructor() {
    // Create Aedes broker instance
    this.broker = new aedes();

    // Create TCP server
    this.server = createServer(this.broker.handle);

    // Create WebSocket server
    this.wsServer = createWebSocketServer();
    ws.createServer({ server: this.wsServer }, this.broker.handle);

    // Setup event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Client connected event
    this.broker.on('client', (client: any) => {
      logger.info(`Client connected: ${client.id}`);
    });

    // Client disconnected event
    this.broker.on('clientDisconnect', (client: any) => {
      logger.info(`Client disconnected: ${client.id}`);
    });

    // Published event
    this.broker.on('publish', (packet: any, client: any) => {
      if (client) {
        logger.debug(`Client ${client.id} published to ${packet.topic}`);
      }
    });

    // Subscribed event
    this.broker.on('subscribe', (subscriptions: any, client: any) => {
      if (client) {
        const topics = subscriptions.map((s: any) => s.topic).join(', ');
        logger.debug(`Client ${client.id} subscribed to ${topics}`);
      }
    });

    // Authentication event
    this.broker.authenticate = (client: any, username: any, password: any, callback: any) => {
      // Here you would implement actual authentication
      // For now, we authenticate everyone
      callback(null, true);
    };

    // Authorization event (for pub/sub)
    this.broker.authorizePublish = (client: any, packet: any, callback: any) => {
      // Here you would implement authorization for publishing
      // For now, we authorize all publish operations
      callback(null);
    };

    this.broker.authorizeSubscribe = (client: any, subscription: any, callback: any) => {
      // Here you would implement authorization for subscribing
      // For now, we authorize all subscribe operations
      callback(null, subscription);
    };
  }

  public start(): void {
    // Start TCP server
    this.server.listen(config.mqtt.port, config.mqtt.host, () => {
      logger.info(`MQTT server started on port ${config.mqtt.port}`);
    });

    // Start WebSocket server
    this.wsServer.listen(config.mqtt.wsPort, () => {
      logger.info(`MQTT WebSocket server started on port ${config.mqtt.wsPort}`);
    });
  }

  public stop(): void {
    this.server.close(() => {
      logger.info('MQTT server stopped');
    });

    this.wsServer.close(() => {
      logger.info('MQTT WebSocket server stopped');
    });

    this.broker.close(() => {
      logger.info('MQTT broker closed');
    });
  }
} 