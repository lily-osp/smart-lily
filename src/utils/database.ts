import { DataSource } from 'typeorm';
import path from 'path';
import { AutomationRule, Condition, Action } from './automation';
import logger from './logger';

// Define entities for TypeORM
export class MessageHistory {
  id!: number;
  topic!: string;
  payload!: string;
  timestamp!: Date;
  retain!: boolean;
  qos!: number;
}

export class AutomationRuleEntity {
  id!: string;
  name!: string;
  description?: string;
  enabled!: boolean;
  conditions!: string; // JSON stringified conditions
  actions!: string; // JSON stringified actions
  logicOperator!: string;
  createdAt!: number;
  updatedAt!: number;
  lastTriggered?: number;
}

// Define the AppDataSource
export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: path.join(process.cwd(), 'data', 'smartlily.db'),
  entities: [MessageHistory, AutomationRuleEntity],
  synchronize: true,
  logging: false
});

// Initialize database connection
export async function initializeDatabase() {
  try {
    // Create the data directory if it doesn't exist
    const fs = require('fs');
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }

    await AppDataSource.initialize();
    logger.info('Database connection established successfully');
    return true;
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Database initialization error: ${error.message}`);
    } else {
      logger.error('Unknown database initialization error');
    }
    return false;
  }
}

// Convert between AutomationRule and AutomationRuleEntity
export function toEntity(rule: AutomationRule): AutomationRuleEntity {
  const entity = new AutomationRuleEntity();
  entity.id = rule.id;
  entity.name = rule.name;
  entity.description = rule.description;
  entity.enabled = rule.enabled;
  entity.conditions = JSON.stringify(rule.conditions);
  entity.actions = JSON.stringify(rule.actions);
  entity.logicOperator = rule.logicOperator;
  entity.createdAt = rule.createdAt;
  entity.updatedAt = rule.updatedAt;
  entity.lastTriggered = rule.lastTriggered;
  return entity;
}

export function fromEntity(entity: AutomationRuleEntity): AutomationRule {
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description,
    enabled: entity.enabled,
    conditions: JSON.parse(entity.conditions) as Condition[],
    actions: JSON.parse(entity.actions) as Action[],
    logicOperator: entity.logicOperator as 'AND' | 'OR',
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    lastTriggered: entity.lastTriggered
  };
}

// Message History Repository
export const MessageHistoryRepository = {
  async saveMessage(topic: string, payload: any, options: { retain: boolean, qos: number } = { retain: false, qos: 0 }) {
    const message = new MessageHistory();
    message.topic = topic;
    message.payload = typeof payload === 'object' ? JSON.stringify(payload) : payload.toString();
    message.timestamp = new Date();
    message.retain = options.retain;
    message.qos = options.qos;
    
    return await AppDataSource.getRepository(MessageHistory).save(message);
  },
  
  async getMessagesByTopic(topic: string, limit: number = 100) {
    return await AppDataSource.getRepository(MessageHistory)
      .createQueryBuilder('message')
      .where('message.topic = :topic', { topic })
      .orderBy('message.timestamp', 'DESC')
      .take(limit)
      .getMany();
  },
  
  async getRecentMessages(limit: number = 100) {
    return await AppDataSource.getRepository(MessageHistory)
      .createQueryBuilder('message')
      .orderBy('message.timestamp', 'DESC')
      .take(limit)
      .getMany();
  },
  
  async getTopicHistory(topic: string, startTime?: Date, endTime?: Date) {
    const queryBuilder = AppDataSource.getRepository(MessageHistory)
      .createQueryBuilder('message')
      .where('message.topic = :topic', { topic });
    
    if (startTime) {
      queryBuilder.andWhere('message.timestamp >= :startTime', { startTime });
    }
    
    if (endTime) {
      queryBuilder.andWhere('message.timestamp <= :endTime', { endTime });
    }
    
    return await queryBuilder
      .orderBy('message.timestamp', 'ASC')
      .getMany();
  }
};

// Automation Rule Repository
export const AutomationRuleRepository = {
  async saveRule(rule: AutomationRule) {
    const entity = toEntity(rule);
    return await AppDataSource.getRepository(AutomationRuleEntity).save(entity);
  },
  
  async getRuleById(id: string) {
    const entity = await AppDataSource.getRepository(AutomationRuleEntity).findOne({
      where: { id }
    });
    return entity ? fromEntity(entity) : undefined;
  },
  
  async getAllRules() {
    const entities = await AppDataSource.getRepository(AutomationRuleEntity).find();
    return entities.map(entity => fromEntity(entity));
  },
  
  async deleteRule(id: string) {
    const result = await AppDataSource.getRepository(AutomationRuleEntity).delete(id);
    return result.affected && result.affected > 0;
  },
  
  async updateRule(id: string, updates: Partial<AutomationRule>) {
    const entity = await AppDataSource.getRepository(AutomationRuleEntity).findOne({
      where: { id }
    });
    
    if (!entity) {
      return undefined;
    }
    
    if (updates.conditions) {
      entity.conditions = JSON.stringify(updates.conditions);
    }
    
    if (updates.actions) {
      entity.actions = JSON.stringify(updates.actions);
    }
    
    if (updates.name) entity.name = updates.name;
    if (updates.description !== undefined) entity.description = updates.description;
    if (updates.enabled !== undefined) entity.enabled = updates.enabled;
    if (updates.logicOperator) entity.logicOperator = updates.logicOperator;
    if (updates.lastTriggered) entity.lastTriggered = updates.lastTriggered;
    
    entity.updatedAt = Date.now();
    
    await AppDataSource.getRepository(AutomationRuleEntity).save(entity);
    return fromEntity(entity);
  }
}; 