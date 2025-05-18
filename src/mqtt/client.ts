import * as mqtt from 'mqtt';
import logger from '../utils/logger';
import { config } from '../config';

export class MqttClient {
  private client!: mqtt.MqttClient;
  private clientId: string;

  constructor(clientId: string = `mqtt_client_${Math.random().toString(16).substring(2, 8)}`) {
    this.clientId = clientId;
  }

  public connect(
    optionsOrUrl?: string | mqtt.IClientOptions,
    options: mqtt.IClientOptions = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Set default client options
      const defaultOptions: mqtt.IClientOptions = {
        clientId: this.clientId,
        clean: true,
        connectTimeout: 4000,
        reconnectPeriod: 1000,
      };

      let url = `mqtt://${config.mqtt.host}:${config.mqtt.port}`;
      let mqttOptions = { ...defaultOptions };

      // Handle both function signatures:
      // connect() - use defaults
      // connect(options) - use provided options
      // connect(url) - use provided url with defaults
      // connect(url, options) - use both provided url and options
      if (typeof optionsOrUrl === 'string') {
        url = optionsOrUrl;
        mqttOptions = { ...defaultOptions, ...options };
      } else if (optionsOrUrl) {
        mqttOptions = { ...defaultOptions, ...optionsOrUrl };
      }

      // Connect to the MQTT server
      this.client = mqtt.connect(url, mqttOptions);

      // Handle connection events
      this.client.on('connect', () => {
        logger.info(`Client ${this.clientId} connected to ${url}`);
        resolve();
      });

      this.client.on('error', (error) => {
        logger.error(`Client ${this.clientId} error: ${error.message}`);
        reject(error);
      });

      // Handle other events
      this.client.on('reconnect', () => {
        logger.debug(`Client ${this.clientId} reconnecting...`);
      });

      this.client.on('disconnect', () => {
        logger.info(`Client ${this.clientId} disconnected`);
      });

      this.client.on('message', (topic, message) => {
        logger.debug(`Client ${this.clientId} received message on ${topic}: ${message.toString()}`);
      });
    });
  }

  public subscribe(topic: string, options: mqtt.IClientSubscribeOptions = { qos: 0 }): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.client || !this.client.connected) {
        reject(new Error('MQTT client not connected'));
        return;
      }
      
      this.client.subscribe(topic, options, (error) => {
        if (error) {
          reject(error);
        } else {
          logger.debug(`MQTT client subscribed to: ${topic}`);
          resolve();
        }
      });
    });
  }

  public unsubscribe(topic: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.client || !this.client.connected) {
        reject(new Error('MQTT client not connected'));
        return;
      }
      
      this.client.unsubscribe(topic, (error) => {
        if (error) {
          reject(error);
        } else {
          logger.debug(`MQTT client unsubscribed from: ${topic}`);
          resolve();
        }
      });
    });
  }

  public publish(
    topic: string,
    message: string | Buffer,
    options: mqtt.IClientPublishOptions = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.client.connected) {
        reject(new Error('Client not connected'));
        return;
      }

      this.client.publish(topic, message, options, (error) => {
        if (error) {
          logger.error(`Failed to publish to ${topic}: ${error.message}`);
          reject(error);
          return;
        }

        logger.debug(`Published message to ${topic}`);
        resolve();
      });
    });
  }

  public disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve();
        return;
      }

      this.client.end(true, {}, () => {
        logger.info(`Client ${this.clientId} disconnected`);
        resolve();
      });
    });
  }
  
  // Get the underlying MQTT client
  public getClient(): mqtt.MqttClient {
    return this.client;
  }
} 