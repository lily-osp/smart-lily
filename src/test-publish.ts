import { MqttClient } from './mqtt/client';
import logger from './utils/logger';

async function main() {
  try {
    logger.info('Starting test publisher');
    
    // Create MQTT client
    const client = new MqttClient('test-publisher');
    
    // Connect to MQTT broker
    logger.info('Connecting to MQTT broker...');
    await client.connect();
    logger.info('Connected to MQTT broker');
    
    // Publish test messages
    for (let i = 1; i <= 5; i++) {
      const topic = `test/message/${i}`;
      const message = {
        id: i,
        timestamp: Date.now(),
        value: Math.random() * 100,
        status: i % 2 === 0 ? 'active' : 'standby'
      };
      
      logger.info(`Publishing message to ${topic}: ${JSON.stringify(message)}`);
      await client.publish(topic, JSON.stringify(message));
      
      // Wait 1 second between messages
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Publish a message to system/time/iso topic
    const isoTime = new Date().toISOString();
    logger.info(`Publishing current time to system/time/iso: ${isoTime}`);
    await client.publish('system/time/iso', isoTime);
    
    // Publish to system/uptime
    const uptime = 3600; // 1 hour in seconds
    logger.info(`Publishing uptime to system/uptime: ${uptime}`);
    await client.publish('system/uptime', uptime.toString());
    
    // Disconnect
    logger.info('Test completed, disconnecting...');
    await client.disconnect();
    logger.info('Disconnected from MQTT broker');
    
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Test failed: ${error.message}`);
    } else {
      logger.error('Test failed with unknown error');
    }
  }
}

// Run the test
main().catch(err => {
  logger.error('Unhandled error:', err);
  process.exit(1);
}); 