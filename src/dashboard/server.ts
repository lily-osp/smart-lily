import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import logger from '../utils/logger';
import { MqttClient } from '../mqtt/client';
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
  private automationService!: AutomationService;
  private webhookService!: WebhookService;
  
  // Track connected clients and active topics
  private connectedClients: string[] = [];
  private activeTopics: Map<string, { count: number, lastMessage: any }> = new Map();
  
  // Stats
  private messageCount: number = 0;
  private startTime: number = Date.now();

  constructor(port: number = config.dashboard.port) {
    this.port = port;
    
    // Create Express app
    this.app = express();
    
    // Configure middleware
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Configure static files and views
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.set('views', path.join(__dirname, 'views'));
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

  private async setupMqttMonitoring() {
    try {
      // Initialize the database
      await initializeDatabase();
      
      // Connect the MQTT client
      await this.mqttClient.connect();
      
      // Initialize the automation service
      this.automationService.initialize();
      
      // Initialize the webhook service
      this.webhookService.initialize();
      
      // Subscribe to system information topic
      await this.mqttClient.subscribe('$SYS/#');
      
      // Subscribe to wildcard topic to monitor all messages
      await this.mqttClient.subscribe('#');
      
      // Get all automation rules from the database and add them to the service
      const rules = await AutomationRuleRepository.getAllRules();
      rules.forEach(rule => {
        this.automationService.addRule(rule);
      });
      
      // Set up automation service event handlers
      this.setupAutomationEvents();
      
      // Handle incoming messages
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
          
          // Emit message event to Socket.IO clients
          this.io.emit('mqtt-message', {
            topic,
            payload: parsedMessage,
            timestamp: new Date().toISOString()
          });
          
          // Save message to database for history
          await MessageHistoryRepository.saveMessage(topic, message.toString(), {
            retain: packet.retain,
            qos: packet.qos
          });
          
          // Trigger webhook events for this topic
          await this.webhookService.triggerEvent('message', {
            topic,
            payload: parsedMessage,
            retain: packet.retain,
            qos: packet.qos
          });
          
        } catch (error) {
          if (error instanceof Error) {
            logger.error(`Error processing MQTT message: ${error.message}`);
          }
        }
      });
      
      // Handle client connected events
      this.mqttClient.getClient().on('connect', () => {
        logger.info('Dashboard MQTT client connected');
        
        // Trigger webhook event for connection
        this.webhookService.triggerEvent('connection', {
          clientId: 'dashboard-monitor',
          timestamp: new Date().toISOString()
        });
      });
      
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Failed to set up MQTT monitoring: ${error.message}`);
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