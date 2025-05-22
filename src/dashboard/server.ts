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
import mqtt from 'mqtt';

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
  private connectedClients: Map<string, any> = new Map();
  private activeTopics: Map<string, { count: number, lastMessage: any, subscribers?: Set<string> }> = new Map();
  private uiWatchedTopics: Set<string> = new Set<string>(); // New: Topics UI is actively watching
  
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
    
    // Create Socket.IO server with CORS allowed
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      transports: ['websocket', 'polling']
    });
    
    logger.info('Socket.IO server configured with CORS and transports');
    
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
    
    // Debug page
    this.app.get('/debug', (req: Request, res: Response) => {
      logger.info('Debug page requested');
      res.render('debug', {
        title: 'MQTT Dashboard Debug',
        port: config.mqtt.port,
        wsPort: config.mqtt.wsPort
      });
    });
    
    // Socket.IO Test page
    this.app.get('/test-socket', (req: Request, res: Response) => {
      logger.info('Socket.IO test page requested');
      res.render('test-socket', {
        title: 'Socket.IO Diagnostic Tool',
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
        connectedClients: this.connectedClients.size,
        messageCount: this.messageCount,
        activeTopics: Array.from(this.activeTopics.entries()).map(([topic, data]) => ({
          topic,
          subscribers: data.subscribers ? data.subscribers.size : 0,
          lastMessage: data.lastMessage
        }))
      });
    });
    
    // API route to get all topics
    this.app.get('/api/topics', (req: Request, res: Response) => {
      const topics = Array.from(this.activeTopics.entries()).map(([topic, data]) => ({
        topic,
        subscribers: data.subscribers ? data.subscribers.size : 0,
        lastMessage: data.lastMessage,
        lastUpdate: new Date().toISOString()
      }));
      
      res.json(topics);
    });
    
    // API route to get connected clients
    this.app.get('/api/clients', (req: Request, res: Response) => {
      res.json(Array.from(this.connectedClients.values()));
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
        subscribers: topicData.subscribers ? topicData.subscribers.size : 0,
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

    // API routes
    this.app.get('/api/system-stats', this.getSystemStats.bind(this));
  }

  private setupSocketEvents() {
    this.io.on('connection', (socket) => {
      logger.info(`Socket.IO client connected: ${socket.id}`);

      // Send initial state to the newly connected client
      socket.emit('initial_state', {
        clients: Array.from(this.connectedClients.values()),
        topics: Array.from(this.activeTopics.entries()).map(([topicName, tData]) => this.getPublicTopicData(topicName, tData)),
        stats: this.getStatsPayload(),
        watchedTopics: Array.from(this.uiWatchedTopics)
      });

      socket.on('disconnect', () => {
        logger.info(`Socket.IO client disconnected: ${socket.id}`);
      });

      socket.on('ui_watch_topic', (topic: string) => {
        logger.info(`Socket.IO client ${socket.id} started watching topic: ${topic}`);
        this.uiWatchedTopics.add(topic);
        socket.emit('watched_topics_update', Array.from(this.uiWatchedTopics)); // Confirm update to client
      });

      socket.on('ui_unwatch_topic', (topic: string) => {
        logger.info(`Socket.IO client ${socket.id} stopped watching topic: ${topic}`);
        this.uiWatchedTopics.delete(topic);
        socket.emit('watched_topics_update', Array.from(this.uiWatchedTopics)); // Confirm update to client
      });
      
      socket.on('publish_message', (data: { topic: string, payload: string, retain?: boolean, qos?: number }) => {
        if (!this.mqttClient || !this.mqttClient.getClient().connected) {
          logger.warn('Cannot publish, dashboard MqttClient not connected.');
          socket.emit('publish_error', 'MQTT client not connected.');
          return;
        }
        try {
          const opts: mqtt.IClientPublishOptions = {};
          if (data.retain !== undefined) opts.retain = data.retain;
          if (data.qos !== undefined) opts.qos = data.qos as (0 | 1 | 2);
          
          this.mqttClient.publish(data.topic, data.payload, opts)
            .then(() => {
              logger.info(`Dashboard published message to ${data.topic}`);
              socket.emit('publish_success', { topic: data.topic });
            })
            .catch(err => {
              logger.error(`Dashboard failed to publish message: ${err.message}`);
              socket.emit('publish_error', err.message);
            });
        } catch (error) {
          logger.error(`Error publishing message from dashboard: ${error instanceof Error ? error.message : String(error)}`);
          socket.emit('publish_error', error instanceof Error ? error.message : String(error));
        }
      });

      // Existing automation and other socket event handlers should be preserved here
      // For example, if there were listeners for automation rules:
      // socket.on('get_automation_rules', () => { /* ... */ });
      // socket.on('save_automation_rule', (rule) => { /* ... */ });
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
    if (!this.mqttServer) {
      logger.warn('MqttServer instance not provided to DashboardServer, MQTT server events will not be handled directly.');
      return;
    }
    logger.info('Setting up MQTT server event handlers');

    // Client connected event
    this.mqttServer.on('client_connected', (clientDetails: { clientId: string, protocol: string, address: string, connectedAt: string }) => {
      logger.info(`Dashboard: MQTT Client connected via MqttServer: ${clientDetails.clientId}`);
      this.connectedClients.set(clientDetails.clientId, { ...clientDetails, subscriptions: new Set<string>() });
      
      this.io.emit('client_update', { type: 'connect', client: this.connectedClients.get(clientDetails.clientId) });
      this.io.emit('stats_update', this.getStatsPayload());

      this.webhookService.triggerEvent('connection', {
        clientId: clientDetails.clientId,
        address: clientDetails.address,
        protocol: clientDetails.protocol,
        timestamp: clientDetails.connectedAt
      }).catch(err => {
        logger.warn(`Failed to trigger connection webhook: ${err.message}`);
      });
    });

    // Client disconnected event
    this.mqttServer.on('client_disconnected', (data: { clientId: string, disconnectedAt: string }) => {
      logger.info(`Dashboard: MQTT Client disconnected via MqttServer: ${data.clientId}`);
      const clientDetails = this.connectedClients.get(data.clientId);
      this.connectedClients.delete(data.clientId);

      // Update topic subscriber counts
      if (clientDetails && clientDetails.subscriptions) {
        clientDetails.subscriptions.forEach((topic: string) => {
          const topicData = this.activeTopics.get(topic);
          if (topicData && topicData.subscribers) {
            topicData.subscribers.delete(data.clientId);
            if (topicData.subscribers.size === 0) {
              // Optionally remove topic from activeTopics if no subscribers and no recent messages
              // Or mark as inactive
            }
            this.io.emit('topic_update', { topic, data: this.getPublicTopicData(topic, topicData) });
          }
        });
      }
      
      this.io.emit('client_update', { type: 'disconnect', clientId: data.clientId, disconnectedAt: data.disconnectedAt });
      this.io.emit('stats_update', this.getStatsPayload());

      this.webhookService.triggerEvent('disconnection', {
        clientId: data.clientId,
        timestamp: data.disconnectedAt
      }).catch(err => {
        logger.warn(`Failed to trigger disconnection webhook: ${err.message}`);
      });
    });

    // Message event from MQTT server (for messages published *through* this broker)
    this.mqttServer.on('message', async (message: { topic: string, payload: Buffer | string, qos: number, retain: boolean, clientId: string, timestamp: string }) => {
      logger.debug(`Dashboard: MqttServer received message on ${message.topic} from ${message.clientId}`);
      this.messageCount++;
      
      let parsedPayload: any;
      const rawPayload = message.payload.toString();
      try {
        parsedPayload = JSON.parse(rawPayload);
      } catch (e) {
        parsedPayload = rawPayload;
      }

      const topicData = this.activeTopics.get(message.topic) || { count: 0, lastMessage: null, subscribers: new Set<string>() };
      topicData.lastMessage = parsedPayload;
      // topicData.count might be used for message count per topic, or number of subscribers.
      // If it's for subscribers, it should be updated in 'subscribe' event. Let's assume 'subscribers' set is for that.
      this.activeTopics.set(message.topic, topicData);

      const fullMessageData = {
        ...message,
        payload: parsedPayload, // Send parsed payload
        timestamp: message.timestamp || new Date().toISOString() // Ensure timestamp
      };
      
      this.io.emit('mqtt_message', fullMessageData);
      this.io.emit('topic_update', { topic: message.topic, data: this.getPublicTopicData(message.topic, topicData) });
      this.io.emit('stats_update', this.getStatsPayload());

      try {
        await MessageHistoryRepository.saveMessage(message.topic, rawPayload, { // Save raw payload
          retain: message.retain,
          qos: message.qos,
        });
      } catch (dbError) {
        logger.warn(`Failed to save MqttServer message to database: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
      }

      try {
        await this.webhookService.triggerEvent('message', fullMessageData);
      } catch (webhookError) {
        logger.warn(`Failed to trigger MqttServer message webhook: ${webhookError instanceof Error ? webhookError.message : 'Unknown error'}`);
      }
    });
    
    // Subscribed event
    this.mqttServer.on('client_subscribe', (data: { clientId: string, topics: string[] }) => {
      logger.info(`Dashboard: Client ${data.clientId} subscribed via MqttServer to ${data.topics.join(', ')}`);
      const clientDetails = this.connectedClients.get(data.clientId);
      if (clientDetails) {
        data.topics.forEach(topic => {
          clientDetails.subscriptions.add(topic);
          const topicData = this.activeTopics.get(topic) || { count: 0, lastMessage: null, subscribers: new Set<string>() };
          topicData.subscribers!.add(data.clientId);
          this.activeTopics.set(topic, topicData);
          this.io.emit('topic_update', { topic, data: this.getPublicTopicData(topic, topicData) });
        });
        this.connectedClients.set(data.clientId, clientDetails); // Re-set to update
        this.io.emit('client_update', { type: 'subscribe', client: clientDetails }); // Notify UI of subscription changes
      }
      this.io.emit('stats_update', this.getStatsPayload());
    });

    // Unsubscribed event (Aedes emits this as 'unsubscribe')
    this.mqttServer.on('unsubscribe', (unsubscriptions: any, client: any) => {
      if (client) {
        const topics = unsubscriptions.map((s: any) => s.topic);
        logger.info(`Dashboard: Client ${client.id} unsubscribed via MqttServer from ${topics.join(', ')}`);
        const clientDetails = this.connectedClients.get(client.id);
        if (clientDetails) {
          topics.forEach((topic: string) => {
            clientDetails.subscriptions.delete(topic);
            const topicData = this.activeTopics.get(topic);
            if (topicData && topicData.subscribers) {
              topicData.subscribers.delete(client.id);
              if (topicData.subscribers.size === 0) {
                // Optional: logic if topic becomes inactive
              }
              this.io.emit('topic_update', { topic, data: this.getPublicTopicData(topic, topicData) });
            }
          });
          this.connectedClients.set(client.id, clientDetails); // Re-set to update
          this.io.emit('client_update', { type: 'unsubscribe', client: clientDetails, topics }); // Notify UI
        }
        this.io.emit('stats_update', this.getStatsPayload());
      }
    });
  }

  // Helper to get current stats for emission
  private getStatsPayload() {
    return {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      connectedClients: this.connectedClients.size,
      messageCount: this.messageCount,
      activeTopicsCount: this.activeTopics.size
      // activeTopics: Array.from(this.activeTopics.keys()) // Optionally send keys or full topic data
    };
  }

  private getPublicTopicData(topic: string, topicData: any) {
    return {
      topic,
      subscribers: topicData.subscribers ? topicData.subscribers.size : 0,
      lastMessage: topicData.lastMessage,
      // Add any other relevant fields for the UI like last message timestamp
    };
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
        this.mqttClient.getClient().on('message', async (topic: string, payload: Buffer, packet: mqtt.IPublishPacket) => {
          logger.debug(`Dashboard MqttClient received message on ${topic}`);
          this.messageCount++;

          let parsedPayload: any;
          const rawPayload = payload.toString();
          try {
            parsedPayload = JSON.parse(rawPayload);
          } catch (e) {
            parsedPayload = rawPayload;
          }

          // Update activeTopics with the latest message, regardless of UI watching
          // Ensure 'topic' field is correctly populated in activeTopics map entries
          const currentTopicData = this.activeTopics.get(topic) || { topic: topic, count: 0, lastMessage: null, subscribers: new Set<string>() };
          currentTopicData.lastMessage = parsedPayload;
          // currentTopicData.count could be incremented here if it represents messages per topic
          this.activeTopics.set(topic, currentTopicData);

          const messageData = {
            topic: topic,
            payload: parsedPayload,
            qos: packet.qos,
            retain: packet.retain,
            timestamp: new Date().toISOString()
          };

          // Emit detailed mqtt_message only if topic is being watched by at least one UI client
          // Or, more simply, if it's in this.uiWatchedTopics (which aggregates all UI desires)
          if (this.uiWatchedTopics.has(topic) || this.uiWatchedTopics.has('#') || topic.startsWith('$SYS')) { // Also always send $SYS topics
            this.io.emit('mqtt_message', messageData);
          }
          
          // Always emit topic_update for the global topic list and stats_update
          this.io.emit('topic_update', { topic, data: this.getPublicTopicData(topic, currentTopicData) });
          this.io.emit('stats_update', this.getStatsPayload());

          // Save message to database (rawPayload is used here)
          try {
            await MessageHistoryRepository.saveMessage(topic, rawPayload, {
              retain: packet.retain,
              qos: packet.qos
            });
          } catch (dbError) {
            logger.warn(`Failed to save MqttClient message to database: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
          }

          // Trigger webhooks (full messageData with parsedPayload)
          try {
            await this.webhookService.triggerEvent('message', messageData);
          } catch (webhookError) {
            logger.warn(`Failed to trigger MqttClient message webhook: ${webhookError instanceof Error ? webhookError.message : 'Unknown error'}`);
          }
        });
      }
      
      // Handle client connected events
      this.mqttClient.getClient().on('connect', () => {
        logger.info('Dashboard MQTT client connected');
        
        // Add to connected clients list if not using MQTT server events
        if (!this.mqttServer) {
          if (!this.connectedClients.has('dashboard-monitor')) {
            // Construct a basic client details object for the dashboard monitor itself
            const dashboardClientDetails = {
              clientId: 'dashboard-monitor',
              protocol: 'mqtt', // Assuming internal client uses MQTT
              address: 'internal',
              connectedAt: new Date().toISOString(),
              subscriptions: new Set<string>(['#', '$SYS/#']) // Reflect its subscriptions
            };
            this.connectedClients.set('dashboard-monitor', dashboardClientDetails);
            // Update UI
            this.io.emit('client_update', { type: 'connect', client: dashboardClientDetails});
            this.io.emit('stats_update', this.getStatsPayload());
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

  // Code Examples page
  private codeExamples(req: Request, res: Response) {
    res.render('code-examples', { title: 'Code Examples' });
  }
  
  // Debug page
  private debug(req: Request, res: Response) {
    logger.info('Debug page requested');
    res.render('debug', { title: 'MQTT Dashboard Debug' });
  }
  
  // API: Get system stats
  private getSystemStats(req: Request, res: Response) {
    res.json({
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      connectedClients: this.connectedClients.size,
      messageCount: this.messageCount,
      activeTopics: Array.from(this.activeTopics.entries()).map(([topic, data]) => ({
        topic,
        subscribers: data.subscribers ? data.subscribers.size : 0,
        lastMessage: data.lastMessage
      }))
    });
  }
} 