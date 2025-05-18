import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import logger from '../utils/logger';
import { MqttClient } from '../mqtt/client';
import { MqttServer } from '../mqtt/server';
import { config } from '../config';
import { AutomationService, AutomationRule, Condition, Action } from '../utils/automation';
import { v4 as uuidv4 } from 'uuid';
import { WebhookService, WebhookConfig } from '../utils/webhook';
import { initializeDatabase, MessageHistoryRepository, AutomationRuleRepository } from '../utils/database';
import 'reflect-metadata';

export class DashboardServer {
  private app: express.Application;
  private server: http.Server;
  private io: SocketIOServer;
  private port: number;
  private mqttClient: MqttClient;
  private mqttServer?: MqttServer;
  private automationService!: AutomationService;
  private webhookService!: WebhookService;
  
  // Track connected clients and active topics
  private connectedClients: string[] = [];
  private activeTopics: Map<string, { count: number, lastMessage: any }> = new Map();
  
  // Stats
  private messageCount: number = 0;
  private startTime: number = Date.now();

  constructor(port: number = config.dashboard.port, mqttServer?: MqttServer) {
    this.port = port;
    this.mqttServer = mqttServer;
    
    // Create Express app
    this.app = express();
    
    // Configure middleware
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Configure static files and views
    this.app.use(express.static(path.join(__dirname, 'public')));
    
    // Fix views path to correctly point to views directory after compilation
    const viewsPath = path.join(__dirname, '..', '..', 'src', 'dashboard', 'views');
    this.app.set('views', viewsPath);
    this.app.set('view engine', 'ejs');
    
    // Create HTTP server
    this.server = http.createServer(this.app);
    
    // Create Socket.IO server
    this.io = new SocketIOServer(this.server);
    
    // Create MQTT client for monitoring
    this.mqttClient = new MqttClient('dashboard-monitor');
    
    // Initialize services
    // They will be properly initialized once MQTT connection is established
    this.automationService = new AutomationService(this.mqttClient);
    this.webhookService = new WebhookService();
    
    // Set up routes and socket events
    this.setupRoutes();
    this.setupSocketEvents();
    
    // Set up MQTT server event handlers if provided
    if (this.mqttServer) {
      this.setupMqttServerEvents();
    }
    
    // Set up MQTT client monitoring
    this.setupMqttMonitoring();
  }

  private setupRoutes() {
    // Home route - render dashboard
    this.app.get('/', (req: Request, res: Response) => {
      res.render('index', {
        title: 'MQTT Dashboard',
        port: config.mqtt.port,
        wsPort: config.mqtt.wsPort
      });
    });
    
    // Topics management page
    this.app.get('/topics', (req: Request, res: Response) => {
      res.render('topics', {
        title: 'MQTT Topics Management',
        port: config.mqtt.port,
        wsPort: config.mqtt.wsPort
      });
    });
    
    // Automation management page
    this.app.get('/automation', (req: Request, res: Response) => {
      res.render('automation', {
        title: 'MQTT Automation Rules',
        port: config.mqtt.port,
        wsPort: config.mqtt.wsPort
      });
    });
    
    // Code examples page
    this.app.get('/code-examples', (req: Request, res: Response) => {
      res.render('code-examples', {
        title: 'MQTT Code Examples',
        port: config.mqtt.port,
        wsPort: config.mqtt.wsPort
      });
    });
    
    // Visualization page
    this.app.get('/visualization', (req: Request, res: Response) => {
      res.render('visualization', {
        title: 'MQTT Data Visualization',
        port: config.mqtt.port,
        wsPort: config.mqtt.wsPort
      });
    });
    
    // Webhooks page
    this.app.get('/webhooks', (req: Request, res: Response) => {
      res.render('webhooks', {
        title: 'MQTT Webhooks',
        port: config.mqtt.port,
        wsPort: config.mqtt.wsPort
      });
    });
    
    // Quick link handler for automation rules
    this.app.get('/rule/:id', (req: Request, res: Response) => {
      const ruleId = req.params.id;
      // Redirect to the automation page with the rule ID as a query parameter
      res.redirect(`/automation?rule=${ruleId}`);
    });
    
    // API route for server stats
    this.app.get('/api/stats', (req: Request, res: Response) => {
      res.json({
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        connectedClients: this.connectedClients.length,
        messageCount: this.messageCount,
        activeTopics: Array.from(this.activeTopics.entries()).map(([topic, data]) => ({
          topic,
          subscribers: data.count,
          lastMessage: data.lastMessage
        }))
      });
    });
    
    // API route to get all topics
    this.app.get('/api/topics', (req: Request, res: Response) => {
      const topics = Array.from(this.activeTopics.entries()).map(([topic, data]) => ({
        topic,
        subscribers: data.count,
        lastMessage: data.lastMessage,
        lastUpdate: new Date().toISOString()
      }));
      
      res.json(topics);
    });
    
    // API route to get a specific topic
    this.app.get('/api/topics/:topic', (req: express.Request, res: express.Response): void => {
      const topic = decodeURIComponent(req.params.topic);
      const topicData = this.activeTopics.get(topic);
      
      if (!topicData) {
        res.status(404).json({ error: 'Topic not found' });
        return;
      }
      
      res.json({
        topic,
        subscribers: topicData.count,
        lastMessage: topicData.lastMessage,
        lastUpdate: new Date().toISOString()
      });
    });
    
    // API route to publish to a topic (create/update)
    this.app.post('/api/topics/:topic', express.json(), (req: express.Request, res: express.Response): void => {
      const topic = decodeURIComponent(req.params.topic);
      const { message, retain = false } = req.body;
      
      if (!message) {
        res.status(400).json({ error: 'Message is required' });
        return;
      }
      
      this.mqttClient.publish(topic, 
        typeof message === 'object' ? JSON.stringify(message) : message, 
        { retain }
      )
      .then(() => {
        res.json({ success: true, topic, action: 'publish' });
      })
      .catch((error) => {
        if (error instanceof Error) {
          res.status(500).json({ error: error.message });
        } else {
          res.status(500).json({ error: 'Unknown error occurred' });
        }
      });
    });
    
    // API route to delete retained message for a topic
    this.app.delete('/api/topics/:topic', (req: express.Request, res: express.Response): void => {
      const topic = decodeURIComponent(req.params.topic);
      
      // Delete retained message by publishing empty message with retain flag
      this.mqttClient.publish(topic, '', { retain: true })
      .then(() => {
        // Remove from active topics map
        this.activeTopics.delete(topic);
        
        res.json({ success: true, topic, action: 'delete' });
      })
      .catch((error) => {
        if (error instanceof Error) {
          res.status(500).json({ error: error.message });
        } else {
          res.status(500).json({ error: 'Unknown error occurred' });
        }
      });
    });
    
    // API route to get message history for a topic
    this.app.get('/api/history/:topic', async (req: express.Request, res: express.Response): Promise<void> => {
      const topic = decodeURIComponent(req.params.topic);
      let startTime: Date | undefined;
      let endTime: Date | undefined;
      
      if (req.query.startTime) {
        startTime = new Date(req.query.startTime as string);
      }
      
      if (req.query.endTime) {
        endTime = new Date(req.query.endTime as string);
      }
      
      try {
        const history = await MessageHistoryRepository.getTopicHistory(topic, startTime, endTime);
        res.json(history);
      } catch (error) {
        if (error instanceof Error) {
          res.status(500).json({ error: error.message });
        } else {
          res.status(500).json({ error: 'Unknown error occurred' });
        }
      }
    });
    
    // API route to get recent messages across all topics
    this.app.get('/api/history', async (req: express.Request, res: express.Response): Promise<void> => {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      
      try {
        const history = await MessageHistoryRepository.getRecentMessages(limit);
        res.json(history);
      } catch (error) {
        if (error instanceof Error) {
          res.status(500).json({ error: error.message });
        } else {
          res.status(500).json({ error: 'Unknown error occurred' });
        }
      }
    });
    
    // Webhook API Routes
    
    // Get all webhooks
    this.app.get('/api/webhooks', (req: express.Request, res: express.Response): void => {
      const webhooks = this.webhookService.getAllWebhooks();
      res.json(webhooks);
    });
    
    // Get a specific webhook
    this.app.get('/api/webhooks/:id', (req: express.Request, res: express.Response): void => {
      const webhookId = req.params.id;
      const webhook = this.webhookService.getWebhook(webhookId);
      
      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }
      
      res.json(webhook);
    });
    
    // Create a new webhook
    this.app.post('/api/webhooks', express.json(), (req: express.Request, res: express.Response): void => {
      try {
        const { name, url, headers, events } = req.body;
        
        if (!name || !url || !events || !Array.isArray(events)) {
          res.status(400).json({ error: 'Invalid webhook configuration' });
          return;
        }
        
        const webhookConfig: WebhookConfig = {
          id: uuidv4(),
          name,
          url,
          headers,
          events,
          enabled: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        
        this.webhookService.addWebhook(webhookConfig);
        res.status(201).json(webhookConfig);
      } catch (error) {
        if (error instanceof Error) {
          res.status(500).json({ error: error.message });
        } else {
          res.status(500).json({ error: 'Unknown error occurred' });
        }
      }
    });
    
    // Update a webhook
    this.app.put('/api/webhooks/:id', express.json(), (req: express.Request, res: express.Response): void => {
      try {
        const webhookId = req.params.id;
        const updates = req.body;
        
        const updatedWebhook = this.webhookService.updateWebhook(webhookId, updates);
        res.json(updatedWebhook);
      } catch (error) {
        if (error instanceof Error) {
          res.status(500).json({ error: error.message });
        } else {
          res.status(500).json({ error: 'Unknown error occurred' });
        }
      }
    });
    
    // Delete a webhook
    this.app.delete('/api/webhooks/:id', (req: express.Request, res: express.Response): void => {
      try {
        const webhookId = req.params.id;
        const result = this.webhookService.deleteWebhook(webhookId);
        
        if (!result) {
          res.status(404).json({ error: 'Webhook not found' });
          return;
        }
        
        res.json({ success: true, id: webhookId });
      } catch (error) {
        if (error instanceof Error) {
          res.status(500).json({ error: error.message });
        } else {
          res.status(500).json({ error: 'Unknown error occurred' });
        }
      }
    });
    
    // Enable a webhook
    this.app.post('/api/webhooks/:id/enable', (req: express.Request, res: express.Response): void => {
      try {
        const webhookId = req.params.id;
        this.webhookService.enableWebhook(webhookId);
        res.json({ success: true, id: webhookId, enabled: true });
      } catch (error) {
        if (error instanceof Error) {
          res.status(500).json({ error: error.message });
        } else {
          res.status(500).json({ error: 'Unknown error occurred' });
        }
      }
    });
    
    // Disable a webhook
    this.app.post('/api/webhooks/:id/disable', (req: express.Request, res: express.Response): void => {
      try {
        const webhookId = req.params.id;
        this.webhookService.disableWebhook(webhookId);
        res.json({ success: true, id: webhookId, enabled: false });
      } catch (error) {
        if (error instanceof Error) {
          res.status(500).json({ error: error.message });
        } else {
          res.status(500).json({ error: 'Unknown error occurred' });
        }
      }
    });
    
    // Test a webhook URL
    this.app.post('/api/webhooks/test', express.json(), async (req: express.Request, res: express.Response): Promise<void> => {
      try {
        const { url } = req.body;
        
        if (!url) {
          res.status(400).json({ error: 'URL is required' });
          return;
        }
        
        const valid = await this.webhookService.validateWebhookUrl(url);
        res.json({ valid });
      } catch (error) {
        if (error instanceof Error) {
          res.status(500).json({ error: error.message });
        } else {
          res.status(500).json({ error: 'Unknown error occurred' });
        }
      }
    });
    
    // Automation API routes
    
    // Get all automation rules
    this.app.get('/api/automation/rules', (req: express.Request, res: express.Response): void => {
      if (!this.automationService) {
        // Return empty array if automation service is not initialized yet
        res.json([]);
        return;
      }
      const rules = this.automationService.getAllRules();
      res.json(rules);
    });
    
    // Get a specific automation rule
    this.app.get('/api/automation/rules/:id', (req: express.Request, res: express.Response): void => {
      if (!this.automationService) {
        res.status(503).json({ error: 'Automation service not initialized yet' });
        return;
      }
      const ruleId = req.params.id;
      const rule = this.automationService.getRule(ruleId);
      
      if (!rule) {
        res.status(404).json({ error: 'Rule not found' });
        return;
      }
      
      res.json(rule);
    });
    
    // Create a new automation rule
    this.app.post('/api/automation/rules', (req: express.Request, res: express.Response): void => {
      if (!this.automationService) {
        res.status(503).json({ error: 'Automation service not initialized yet' });
        return;
      }
      
      try {
        const ruleData = req.body;
        
        // Validate required fields
        if (!ruleData.name || !ruleData.conditions || !ruleData.actions) {
          res.status(400).json({ error: 'Name, conditions, and actions are required' });
          return;
        }
        
        // Generate ID if not provided
        if (!ruleData.id) {
          ruleData.id = uuidv4();
        }
        
        // Set defaults
        const rule: AutomationRule = {
          ...ruleData,
          enabled: ruleData.enabled !== undefined ? ruleData.enabled : true,
          logicOperator: ruleData.logicOperator || 'AND',
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        
        this.automationService.addRule(rule);
        
        res.status(201).json(rule);
      } catch (error) {
        if (error instanceof Error) {
          res.status(400).json({ error: error.message });
        } else {
          res.status(400).json({ error: 'Failed to create automation rule' });
        }
      }
    });
    
    // Update an automation rule
    this.app.put('/api/automation/rules/:id', (req: express.Request, res: express.Response): void => {
      if (!this.automationService) {
        res.status(503).json({ error: 'Automation service not initialized yet' });
        return;
      }
      
      try {
        const ruleId = req.params.id;
        const updates = req.body;
        
        // Prevent updating ID
        if (updates.id && updates.id !== ruleId) {
          res.status(400).json({ error: 'Cannot change rule ID' });
          return;
        }
        
        const updatedRule = this.automationService.updateRule(ruleId, updates);
        res.json(updatedRule);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            res.status(404).json({ error: error.message });
          } else {
            res.status(400).json({ error: error.message });
          }
        } else {
          res.status(400).json({ error: 'Failed to update automation rule' });
        }
      }
    });
    
    // Delete an automation rule
    this.app.delete('/api/automation/rules/:id', (req: express.Request, res: express.Response): void => {
      if (!this.automationService) {
        res.status(503).json({ error: 'Automation service not initialized yet' });
        return;
      }
      
      const ruleId = req.params.id;
      const result = this.automationService.deleteRule(ruleId);
      
      if (!result) {
        res.status(404).json({ error: 'Rule not found' });
        return;
      }
      
      res.json({ success: true, message: 'Rule deleted', id: ruleId });
    });
    
    // Enable an automation rule
    this.app.post('/api/automation/rules/:id/enable', (req: express.Request, res: express.Response): void => {
      if (!this.automationService) {
        res.status(503).json({ error: 'Automation service not initialized yet' });
        return;
      }
      
      const ruleId = req.params.id;
      const rule = this.automationService.getRule(ruleId);
      
      if (!rule) {
        res.status(404).json({ error: 'Rule not found' });
        return;
      }
      
      this.automationService.enableRule(ruleId);
      res.json({ success: true, id: ruleId, enabled: true });
    });
    
    // Disable an automation rule
    this.app.post('/api/automation/rules/:id/disable', (req: express.Request, res: express.Response): void => {
      if (!this.automationService) {
        res.status(503).json({ error: 'Automation service not initialized yet' });
        return;
      }
      
      const ruleId = req.params.id;
      const rule = this.automationService.getRule(ruleId);
      
      if (!rule) {
        res.status(404).json({ error: 'Rule not found' });
        return;
      }
      
      this.automationService.disableRule(ruleId);
      res.json({ success: true, id: ruleId, enabled: false });
    });
  }

  private setupSocketEvents() {
    this.io.on('connection', (socket) => {
      logger.info(`Dashboard client connected: ${socket.id}`);
      
      // Handle client publishing message
      socket.on('publish', async (data: { topic: string, message: string, retain?: boolean }) => {
        try {
          await this.mqttClient.publish(data.topic, data.message, { 
            retain: data.retain || false 
          });
          logger.info(`Message published to ${data.topic} from dashboard`);
          socket.emit('publish_success', { topic: data.topic });
        } catch (error) {
          if (error instanceof Error) {
            logger.error(`Failed to publish: ${error.message}`);
            socket.emit('publish_error', { error: error.message });
          }
        }
      });
      
      // Handle client subscribing to topic
      socket.on('subscribe', async (data: { topic: string }) => {
        try {
          await this.mqttClient.subscribe(data.topic);
          logger.info(`Subscribed to ${data.topic} from dashboard`);
          socket.emit('subscribe_success', { topic: data.topic });
        } catch (error) {
          if (error instanceof Error) {
            logger.error(`Failed to subscribe: ${error.message}`);
            socket.emit('subscribe_error', { error: error.message });
          }
        }
      });

      // Handle client disconnection
      socket.on('disconnect', () => {
        logger.info(`Dashboard client disconnected: ${socket.id}`);
      });
    });
  }

  private setupAutomationEvents() {
    // Don't set up events if automation service is not initialized
    if (!this.automationService) {
      logger.warn('Cannot set up automation events: AutomationService not initialized yet');
      return;
    }
    
    // Forward automation events to connected clients via Socket.IO
    this.automationService.on('rule-added', (rule) => {
      this.io.emit('automation-rule-added', rule);
    });
    
    this.automationService.on('rule-updated', (rule) => {
      this.io.emit('automation-rule-updated', rule);
    });
    
    this.automationService.on('rule-deleted', (ruleId) => {
      this.io.emit('automation-rule-deleted', { id: ruleId });
    });
    
    this.automationService.on('rule-triggered', (rule) => {
      this.io.emit('automation-rule-triggered', rule);
    });
  }

  private setupMqttServerEvents() {
    if (!this.mqttServer) return;
    
    logger.info('Setting up MQTT server event handlers');
    
    // Client connected event
    this.mqttServer.on('client_connected', (data: { clientId: string }) => {
      logger.info(`MQTT client connected: ${data.clientId}`);
      
      // Add to connected clients list if not already there
      if (!this.connectedClients.includes(data.clientId)) {
        this.connectedClients.push(data.clientId);
        logger.debug(`Added client to list: ${data.clientId}, total clients: ${this.connectedClients.length}`);
      }
      
      // Forward to Socket.IO clients
      this.io.emit('client_connected', data);
      
      // Trigger webhook event for connection
      this.webhookService.triggerEvent('connection', {
        clientId: data.clientId,
        timestamp: new Date().toISOString()
      }).catch(err => {
        logger.warn(`Failed to trigger connection webhook: ${err.message}`);
      });
    });
    
    // Client disconnected event
    this.mqttServer.on('client_disconnected', (data: { clientId: string }) => {
      logger.info(`MQTT client disconnected: ${data.clientId}`);
      
      // Remove from connected clients list
      this.connectedClients = this.connectedClients.filter(id => id !== data.clientId);
      logger.debug(`Removed client from list: ${data.clientId}, total clients: ${this.connectedClients.length}`);
      
      // Forward to Socket.IO clients
      this.io.emit('client_disconnected', data);
      
      // Trigger webhook event for disconnection
      this.webhookService.triggerEvent('disconnection', {
        clientId: data.clientId,
        timestamp: new Date().toISOString()
      }).catch(err => {
        logger.warn(`Failed to trigger disconnection webhook: ${err.message}`);
      });
    });
    
    // Message event from MQTT server
    this.mqttServer.on('message', async (data: { topic: string, payload: string, qos: number, retain: boolean, clientId: string, timestamp: string }) => {
      // Update message count
      this.messageCount++;
      
      try {
        // Try to parse message as JSON
        let parsedMessage;
        try {
          parsedMessage = JSON.parse(data.payload);
        } catch (e) {
          parsedMessage = data.payload;
        }
        
        // Update active topics map
        if (!this.activeTopics.has(data.topic)) {
          this.activeTopics.set(data.topic, { count: 0, lastMessage: parsedMessage });
        } else {
          const topicData = this.activeTopics.get(data.topic)!;
          topicData.lastMessage = parsedMessage;
          this.activeTopics.set(data.topic, topicData);
        }
        
        const messageData = {
          topic: data.topic,
          payload: parsedMessage,
          timestamp: data.timestamp,
          retain: data.retain,
          qos: data.qos
        };

        // Emit message event to Socket.IO clients
        this.io.emit('mqtt-message', messageData);
        
        // Log for debugging
        logger.info(`Emitting mqtt-message event for ${data.topic}`);
        logger.info(`Message payload: ${typeof messageData.payload === 'object' ? JSON.stringify(messageData.payload) : messageData.payload}`);
        
        // Save message to database for history
        try {
          await MessageHistoryRepository.saveMessage(data.topic, data.payload, {
            retain: data.retain,
            qos: data.qos
          });
        } catch (dbError) {
          logger.warn(`Failed to save message to database: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
          // Continue even if database save fails
        }
        
        // Trigger webhook events for this topic
        try {
          await this.webhookService.triggerEvent('message', messageData);
        } catch (webhookError) {
          logger.warn(`Failed to trigger webhook: ${webhookError instanceof Error ? webhookError.message : 'Unknown error'}`);
          // Continue even if webhook trigger fails
        }
        
      } catch (error) {
        if (error instanceof Error) {
          logger.error(`Error processing MQTT message from server: ${error.message}`);
        }
      }
    });
  }

  private async setupMqttMonitoring() {
    try {
      // Connect the MQTT client first
      await this.mqttClient.connect();
      
      // Initialize the automation service
      this.automationService.initialize();
      
      // Initialize the webhook service
      this.webhookService.initialize();
      
      // Subscribe to system information topic
      await this.mqttClient.subscribe('$SYS/#');
      
      // Subscribe to wildcard topic to monitor all messages
      await this.mqttClient.subscribe('#');
      
      // Set up automation service event handlers
      this.setupAutomationEvents();
      
      // Handle incoming messages - only needed if MQTT server integration is not available
      if (!this.mqttServer) {
        this.mqttClient.getClient().on('message', async (topic, message, packet) => {
          // Update message count
          this.messageCount++;
          
          try {
            // Try to parse message as JSON
            let parsedMessage;
            try {
              parsedMessage = JSON.parse(message.toString());
            } catch (e) {
              parsedMessage = message.toString();
            }
            
            // Update active topics map
            if (!this.activeTopics.has(topic)) {
              this.activeTopics.set(topic, { count: 0, lastMessage: parsedMessage });
            } else {
              const topicData = this.activeTopics.get(topic)!;
              topicData.lastMessage = parsedMessage;
              this.activeTopics.set(topic, topicData);
            }
            
            const messageData = {
              topic,
              payload: parsedMessage,
              timestamp: new Date().toISOString(),
              retain: packet.retain,
              qos: packet.qos
            };

            // Emit message event to Socket.IO clients
            this.io.emit('mqtt-message', messageData);
            
            // Log for debugging
            logger.debug(`Emitting mqtt-message event for ${topic}`);
            
            // Save message to database for history
            try {
              await MessageHistoryRepository.saveMessage(topic, message.toString(), {
                retain: packet.retain,
                qos: packet.qos
              });
            } catch (dbError) {
              logger.warn(`Failed to save message to database: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
              // Continue even if database save fails
            }
            
            // Trigger webhook events for this topic
            try {
              await this.webhookService.triggerEvent('message', messageData);
            } catch (webhookError) {
              logger.warn(`Failed to trigger webhook: ${webhookError instanceof Error ? webhookError.message : 'Unknown error'}`);
              // Continue even if webhook trigger fails
            }
            
          } catch (error) {
            if (error instanceof Error) {
              logger.error(`Error processing MQTT message: ${error.message}`);
            }
          }
        });
      }
      
      // Handle client connected events
      this.mqttClient.getClient().on('connect', () => {
        logger.info('Dashboard MQTT client connected');
        
        // Add to connected clients list if not using MQTT server events
        if (!this.mqttServer) {
          if (!this.connectedClients.includes('dashboard-monitor')) {
            this.connectedClients.push('dashboard-monitor');
            // Update UI
            this.io.emit('client_connected', { clientId: 'dashboard-monitor' });
          }
        }
        
        // Add to connected clients list if not using MQTT server events
        if (!this.mqttServer) {
          if (!this.connectedClients.includes('dashboard-monitor')) {
            this.connectedClients.push('dashboard-monitor');
          }
        }
        
        // Trigger webhook event for connection
        this.webhookService.triggerEvent('connection', {
          clientId: 'dashboard-monitor',
          timestamp: new Date().toISOString()
        }).catch(err => {
          logger.warn(`Failed to trigger connection webhook: ${err.message}`);
        });
      });
      
      // Try to load automation rules - do this after everything else is initialized
      try {
        // Get all automation rules from the database and add them to the service
        const rules = await AutomationRuleRepository.getAllRules();
        rules.forEach(rule => {
          this.automationService.addRule(rule);
        });
        logger.info(`Loaded ${rules.length} automation rules from database`);
      } catch (rulesError) {
        logger.error(`Failed to load automation rules: ${rulesError instanceof Error ? rulesError.message : 'Unknown error'}`);
        // Continue without rules if loading fails - they can be added later
      }
      
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Failed to set up MQTT monitoring: ${error.message}`);
      } else {
        logger.error('Failed to set up MQTT monitoring: Unknown error');
      }
    }
  }

  public start(): void {
    this.server.listen(this.port, () => {
      logger.info(`Dashboard server listening on port ${this.port}`);
    });
  }

  public stop(): void {
    this.server.close();
    logger.info('Dashboard server stopped');
  }
} 