import { EventEmitter } from 'events';
import { MqttClient } from '../mqtt/client';
import logger from './logger';

// Enum for condition operators
export enum ConditionOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'notEquals',
  GREATER_THAN = 'greaterThan',
  LESS_THAN = 'lessThan',
  CONTAINS = 'contains',
  DOES_NOT_CONTAIN = 'doesNotContain',
  CHANGES = 'changes'
}

// Enum for action types
export enum ActionType {
  PUBLISH_MESSAGE = 'publishMessage',
  SEND_NOTIFICATION = 'sendNotification',
  EXECUTE_COMMAND = 'executeCommand'
}

// Interfaces for automation rule components
export interface Condition {
  id: string;
  topic: string;
  operator: ConditionOperator;
  value: any;
}

export interface Action {
  id: string;
  type: ActionType;
  params: {
    topic?: string;
    message?: any;
    retain?: boolean;
    [key: string]: any;
  };
}

export interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  conditions: Condition[];
  actions: Action[];
  logicOperator: 'AND' | 'OR';
  createdAt: number;
  updatedAt: number;
  lastTriggered?: number;
}

export class AutomationService extends EventEmitter {
  private rules: Map<string, AutomationRule> = new Map();
  private mqttClient: MqttClient;
  private topicValues: Map<string, any> = new Map();
  private subscriptions: Set<string> = new Set();

  constructor(mqttClient: MqttClient) {
    super();
    this.mqttClient = mqttClient;
    // Don't call setupEventListeners here, wait until the client is connected
  }

  // Initialize the service after MQTT client is connected
  public initialize(): void {
    if (this.mqttClient && this.mqttClient.getClient()) {
      this.setupEventListeners();
      logger.info('Automation service initialized successfully');
    } else {
      logger.warn('Cannot initialize automation service: MQTT client not ready');
    }
  }

  private setupEventListeners() {
    const client = this.mqttClient.getClient();
    if (!client) {
      logger.error('Cannot set up event listeners: MQTT client not initialized');
      return;
    }

    client.on('message', (topic, message) => {
      try {
        // Try to parse message as JSON
        let parsedMessage;
        try {
          parsedMessage = JSON.parse(message.toString());
        } catch (e) {
          parsedMessage = message.toString();
        }

        // Store the latest value for this topic
        this.topicValues.set(topic, parsedMessage);

        // Check all rules to see if this message triggers any actions
        this.evaluateRules(topic, parsedMessage);
      } catch (error) {
        if (error instanceof Error) {
          logger.error(`Error processing message for automations: ${error.message}`);
        }
      }
    });
  }

  // Add a new rule
  public addRule(rule: AutomationRule): void {
    // Ensure rule has required fields
    if (!rule.id || !rule.name || !rule.conditions || !rule.actions) {
      throw new Error('Invalid rule format');
    }

    // Subscribe to all topics referenced in conditions
    this.subscribeToTopics(rule.conditions.map(c => c.topic));

    // Store the rule
    this.rules.set(rule.id, {
      ...rule,
      createdAt: rule.createdAt || Date.now(),
      updatedAt: Date.now()
    });

    logger.info(`Added automation rule: ${rule.name} (${rule.id})`);
    this.emit('rule-added', rule);
  }

  // Update existing rule
  public updateRule(ruleId: string, updates: Partial<AutomationRule>): AutomationRule {
    const existingRule = this.rules.get(ruleId);
    if (!existingRule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    // If conditions are updated, subscribe to any new topics
    if (updates.conditions) {
      this.subscribeToTopics(updates.conditions.map(c => c.topic));
    }

    // Update the rule
    const updatedRule = {
      ...existingRule,
      ...updates,
      updatedAt: Date.now()
    };

    this.rules.set(ruleId, updatedRule);
    logger.info(`Updated automation rule: ${updatedRule.name} (${ruleId})`);
    this.emit('rule-updated', updatedRule);
    
    return updatedRule;
  }

  // Delete a rule
  public deleteRule(ruleId: string): boolean {
    const result = this.rules.delete(ruleId);
    if (result) {
      logger.info(`Deleted automation rule: ${ruleId}`);
      this.emit('rule-deleted', ruleId);
      
      // Clean up unused topic subscriptions
      this.cleanupSubscriptions();
    }
    return result;
  }

  // Get a rule by ID
  public getRule(ruleId: string): AutomationRule | undefined {
    return this.rules.get(ruleId);
  }

  // Get all rules
  public getAllRules(): AutomationRule[] {
    return Array.from(this.rules.values());
  }

  // Enable a rule
  public enableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = true;
      rule.updatedAt = Date.now();
      this.rules.set(ruleId, rule);
      logger.info(`Enabled automation rule: ${rule.name} (${ruleId})`);
      this.emit('rule-updated', rule);
    }
  }

  // Disable a rule
  public disableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = false;
      rule.updatedAt = Date.now();
      this.rules.set(ruleId, rule);
      logger.info(`Disabled automation rule: ${rule.name} (${ruleId})`);
      this.emit('rule-updated', rule);
    }
  }

  // Subscribe to topics needed for automation rules
  private subscribeToTopics(topics: string[]): void {
    const newTopics = topics.filter(topic => !this.subscriptions.has(topic));
    
    if (newTopics.length > 0) {
      newTopics.forEach(async (topic) => {
        try {
          await this.mqttClient.subscribe(topic);
          this.subscriptions.add(topic);
          logger.debug(`Subscribed to topic for automation: ${topic}`);
        } catch (error) {
          if (error instanceof Error) {
            logger.error(`Failed to subscribe to topic ${topic}: ${error.message}`);
          }
        }
      });
    }
  }

  // Clean up subscriptions that are no longer needed by any rules
  private cleanupSubscriptions(): void {
    // Get all topics used in rules
    const usedTopics = new Set<string>();
    this.rules.forEach(rule => {
      if (rule.enabled) {
        rule.conditions.forEach(condition => {
          usedTopics.add(condition.topic);
        });
      }
    });

    // Unsubscribe from topics no longer needed
    this.subscriptions.forEach(async (topic) => {
      if (!usedTopics.has(topic)) {
        try {
          await this.mqttClient.unsubscribe(topic);
          this.subscriptions.delete(topic);
          logger.debug(`Unsubscribed from unused topic: ${topic}`);
        } catch (error) {
          if (error instanceof Error) {
            logger.error(`Failed to unsubscribe from topic ${topic}: ${error.message}`);
          }
        }
      }
    });
  }

  // Evaluate rule conditions and execute actions if conditions are met
  private evaluateRules(changedTopic: string, value: any): void {
    this.rules.forEach(rule => {
      // Skip disabled rules
      if (!rule.enabled) return;

      // Check if this rule has a condition for the changed topic
      const relevantConditions = rule.conditions.filter(c => c.topic === changedTopic);
      if (relevantConditions.length === 0) return;

      // Evaluate all conditions
      const results = rule.conditions.map(condition => this.evaluateCondition(condition));

      // Check if all conditions are met (AND) or any condition is met (OR)
      let shouldTrigger = false;
      if (rule.logicOperator === 'AND') {
        shouldTrigger = results.every(result => result);
      } else {
        shouldTrigger = results.some(result => result);
      }

      // Execute actions if conditions are met
      if (shouldTrigger) {
        logger.info(`Triggering rule: ${rule.name} (${rule.id})`);
        rule.lastTriggered = Date.now();
        this.rules.set(rule.id, rule);
        this.executeActions(rule.actions);
        this.emit('rule-triggered', rule);
      }
    });
  }

  // Evaluate a single condition
  private evaluateCondition(condition: Condition): boolean {
    const currentValue = this.topicValues.get(condition.topic);
    
    // Can't evaluate if we don't have a value
    if (currentValue === undefined) return false;

    // Handle different operators
    switch (condition.operator) {
      case ConditionOperator.EQUALS:
        return currentValue == condition.value; // Use loose equality to handle type differences
      
      case ConditionOperator.NOT_EQUALS:
        return currentValue != condition.value;
      
      case ConditionOperator.GREATER_THAN:
        return Number(currentValue) > Number(condition.value);
      
      case ConditionOperator.LESS_THAN:
        return Number(currentValue) < Number(condition.value);
      
      case ConditionOperator.CONTAINS:
        if (typeof currentValue === 'string') {
          return currentValue.includes(String(condition.value));
        } else if (Array.isArray(currentValue)) {
          return currentValue.includes(condition.value);
        }
        return false;
      
      case ConditionOperator.DOES_NOT_CONTAIN:
        if (typeof currentValue === 'string') {
          return !currentValue.includes(String(condition.value));
        } else if (Array.isArray(currentValue)) {
          return !currentValue.includes(condition.value);
        }
        return true;
      
      case ConditionOperator.CHANGES:
        // This just means the topic changed, which is always true here
        return true;
      
      default:
        logger.warn(`Unknown condition operator: ${condition.operator}`);
        return false;
    }
  }

  // Execute a list of actions
  private async executeActions(actions: Action[]): Promise<void> {
    for (const action of actions) {
      try {
        switch (action.type) {
          case ActionType.PUBLISH_MESSAGE:
            if (action.params.topic && action.params.message !== undefined) {
              await this.mqttClient.publish(
                action.params.topic,
                typeof action.params.message === 'object' ? 
                  JSON.stringify(action.params.message) : 
                  String(action.params.message),
                { retain: action.params.retain || false }
              );
              logger.info(`Published message to ${action.params.topic}`);
            }
            break;
          
          case ActionType.SEND_NOTIFICATION:
            // For future implementation (e.g., push notification, webhook, etc.)
            logger.info(`Notification: ${action.params.message}`);
            // You would implement your notification logic here
            break;
          
          case ActionType.EXECUTE_COMMAND:
            // For future implementation (e.g., run a script, call an API, etc.)
            logger.info(`Execute command: ${action.params.command}`);
            // You would implement your command execution logic here
            break;
          
          default:
            logger.warn(`Unknown action type: ${action.type}`);
        }
      } catch (error) {
        if (error instanceof Error) {
          logger.error(`Error executing action: ${error.message}`);
        }
      }
    }
  }
} 