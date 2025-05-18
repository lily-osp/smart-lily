import { MqttClient } from '../mqtt/client';
import logger from '../utils/logger';

// Function to wait for a specified time
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runTest() {
  try {
    // Create publisher client
    const publisher = new MqttClient('test-publisher');

    // Connect client to the MQTT server
    logger.info('Connecting test publisher to MQTT server...');
    await publisher.connect();
    logger.info('Test publisher connected successfully');

    // Define test topics with more descriptive paths
    const topics = [
      'sensor/temperature/living_room',
      'sensor/humidity/bedroom',
      'device/light/kitchen',
      'device/fan/bedroom',
      'control/switch/main_door',
      'status/battery/thermostat'
    ];

    // Publish initial test messages with retain flag to ensure they stay visible
    logger.info('Publishing initial test messages...');
    for (const topic of topics) {
      // Create more detailed payloads based on topic type
      let payload;
      
      if (topic.includes('temperature')) {
        payload = {
          value: (20 + Math.random() * 10).toFixed(1),
          unit: '°C',
          timestamp: new Date().toISOString(),
          status: 'normal'
        };
      } else if (topic.includes('humidity')) {
        payload = {
          value: (40 + Math.random() * 30).toFixed(1),
          unit: '%',
          timestamp: new Date().toISOString(),
          status: 'normal'
        };
      } else if (topic.includes('light')) {
        payload = {
          state: Math.random() > 0.5 ? 'ON' : 'OFF',
          brightness: Math.floor(Math.random() * 100),
          timestamp: new Date().toISOString()
        };
      } else if (topic.includes('fan')) {
        payload = {
          state: Math.random() > 0.5 ? 'ON' : 'OFF',
          speed: Math.floor(Math.random() * 3) + 1,
          timestamp: new Date().toISOString()
        };
      } else if (topic.includes('switch')) {
        payload = {
          state: Math.random() > 0.5 ? 'OPEN' : 'CLOSED',
          last_changed: new Date().toISOString(),
          timestamp: new Date().toISOString()
        };
      } else if (topic.includes('battery')) {
        payload = {
          level: Math.floor(Math.random() * 100),
          charging: Math.random() > 0.7,
          timestamp: new Date().toISOString()
        };
      } else {
        payload = {
          value: Math.random() * 100,
          timestamp: new Date().toISOString()
        };
      }
      
      const testMessage = JSON.stringify(payload);
      logger.info(`Publishing message to topic: ${topic}`);
      logger.debug(`Message content: ${testMessage}`);
      
      // Set retain to true so the message stays available
      await publisher.publish(topic, testMessage, { retain: true });
      
      // Wait between publishes
      await wait(500);
    }

    // Wait a bit then start publishing updates
    logger.info('Initial messages published. Starting update cycle...');
    await wait(2000);

    // Publish updates a few times
    for (let i = 0; i < 3; i++) {
      logger.info(`Publishing update cycle ${i+1}...`);
      
      for (const topic of topics) {
        // Update the values but keep the same structure
        let payload;
        
        if (topic.includes('temperature')) {
          payload = {
            value: (20 + Math.random() * 10).toFixed(1),
            unit: '°C',
            timestamp: new Date().toISOString(),
            status: Math.random() > 0.8 ? 'high' : 'normal'
          };
        } else if (topic.includes('humidity')) {
          payload = {
            value: (40 + Math.random() * 30).toFixed(1),
            unit: '%',
            timestamp: new Date().toISOString(),
            status: Math.random() > 0.8 ? 'high' : 'normal'
          };
        } else if (topic.includes('light')) {
          payload = {
            state: Math.random() > 0.5 ? 'ON' : 'OFF',
            brightness: Math.floor(Math.random() * 100),
            timestamp: new Date().toISOString()
          };
        } else if (topic.includes('fan')) {
          payload = {
            state: Math.random() > 0.5 ? 'ON' : 'OFF',
            speed: Math.floor(Math.random() * 3) + 1,
            timestamp: new Date().toISOString()
          };
        } else if (topic.includes('switch')) {
          payload = {
            state: Math.random() > 0.5 ? 'OPEN' : 'CLOSED',
            last_changed: new Date().toISOString(),
            timestamp: new Date().toISOString()
          };
        } else if (topic.includes('battery')) {
          payload = {
            level: Math.floor(Math.random() * 100),
            charging: Math.random() > 0.7,
            timestamp: new Date().toISOString()
          };
        } else {
          payload = {
            value: Math.random() * 100,
            timestamp: new Date().toISOString()
          };
        }
        
        const testMessage = JSON.stringify(payload);
        logger.info(`Updating topic: ${topic}`);
        logger.debug(`Updated content: ${testMessage}`);
        
        await publisher.publish(topic, testMessage, { retain: true });
        await wait(500);
      }
      
      // Wait between update cycles
      await wait(3000);
    }

    // Disconnect client
    logger.info('Tests completed. Disconnecting test publisher...');
    await publisher.disconnect();

    logger.info('Test completed successfully');
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Test failed: ${error.message}`);
      logger.error(error.stack);
    } else {
      logger.error('Test failed with unknown error');
    }
  }
}

// Run the test
runTest(); 