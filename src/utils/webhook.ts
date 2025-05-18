import axios from 'axios';
import { EventEmitter } from 'events';
import logger from './logger';

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  headers?: Record<string, string>;
  events: string[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export class WebhookService extends EventEmitter {
  private webhooks: Map<string, WebhookConfig> = new Map();
  
  constructor() {
    super();
  }
  
  public initialize(): void {
    logger.info('Webhook service initialized');
  }
  
  // Add a new webhook
  public addWebhook(webhook: WebhookConfig): void {
    if (!webhook.id || !webhook.name || !webhook.url || !webhook.events) {
      throw new Error('Invalid webhook configuration');
    }
    
    this.webhooks.set(webhook.id, {
      ...webhook,
      createdAt: webhook.createdAt || Date.now(),
      updatedAt: Date.now()
    });
    
    logger.info(`Added webhook: ${webhook.name} (${webhook.id})`);
    this.emit('webhook-added', webhook);
  }
  
  // Update existing webhook
  public updateWebhook(webhookId: string, updates: Partial<WebhookConfig>): WebhookConfig {
    const existingWebhook = this.webhooks.get(webhookId);
    if (!existingWebhook) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }
    
    const updatedWebhook = {
      ...existingWebhook,
      ...updates,
      updatedAt: Date.now()
    };
    
    this.webhooks.set(webhookId, updatedWebhook);
    logger.info(`Updated webhook: ${updatedWebhook.name} (${webhookId})`);
    this.emit('webhook-updated', updatedWebhook);
    
    return updatedWebhook;
  }
  
  // Delete a webhook
  public deleteWebhook(webhookId: string): boolean {
    const result = this.webhooks.delete(webhookId);
    if (result) {
      logger.info(`Deleted webhook: ${webhookId}`);
      this.emit('webhook-deleted', webhookId);
    }
    return result;
  }
  
  // Get a webhook by ID
  public getWebhook(webhookId: string): WebhookConfig | undefined {
    return this.webhooks.get(webhookId);
  }
  
  // Get all webhooks
  public getAllWebhooks(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }
  
  // Enable a webhook
  public enableWebhook(webhookId: string): void {
    const webhook = this.webhooks.get(webhookId);
    if (webhook) {
      webhook.enabled = true;
      webhook.updatedAt = Date.now();
      this.webhooks.set(webhookId, webhook);
      logger.info(`Enabled webhook: ${webhook.name} (${webhookId})`);
      this.emit('webhook-updated', webhook);
    }
  }
  
  // Disable a webhook
  public disableWebhook(webhookId: string): void {
    const webhook = this.webhooks.get(webhookId);
    if (webhook) {
      webhook.enabled = false;
      webhook.updatedAt = Date.now();
      this.webhooks.set(webhookId, webhook);
      logger.info(`Disabled webhook: ${webhook.name} (${webhookId})`);
      this.emit('webhook-updated', webhook);
    }
  }
  
  // Trigger a webhook for a specific event
  public async triggerEvent(eventName: string, payload: any): Promise<void> {
    const webhooksForEvent = Array.from(this.webhooks.values())
      .filter(webhook => webhook.enabled && webhook.events.includes(eventName));
    
    if (webhooksForEvent.length === 0) {
      return;
    }
    
    logger.debug(`Triggering ${webhooksForEvent.length} webhooks for event: ${eventName}`);
    
    const eventPayload = {
      event: eventName,
      timestamp: new Date().toISOString(),
      data: payload
    };
    
    const promises = webhooksForEvent.map(async (webhook) => {
      try {
        await axios.post(webhook.url, eventPayload, {
          headers: {
            'Content-Type': 'application/json',
            ...(webhook.headers || {})
          },
          timeout: 5000 // 5 second timeout
        });
        logger.debug(`Successfully triggered webhook ${webhook.id} for event ${eventName}`);
      } catch (error) {
        if (error instanceof Error) {
          logger.error(`Failed to trigger webhook ${webhook.id}: ${error.message}`);
        } else {
          logger.error(`Failed to trigger webhook ${webhook.id} with unknown error`);
        }
      }
    });
    
    await Promise.all(promises);
  }
  
  // Validate a webhook URL
  public async validateWebhookUrl(url: string): Promise<boolean> {
    try {
      const response = await axios.get(url, { timeout: 5000 });
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      return false;
    }
  }
} 