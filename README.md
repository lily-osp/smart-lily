# Smart Lily MQTT Server

A fully-featured MQTT server built with TypeScript, providing a complete solution for IoT device management, messaging, and automation.

<p align="center">
  <img src="https://placehold.co/150x150?text=smart+lily" alt="Smart Lily Logo" width="150" height="150">
</p>

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
  - [Starting the Server](#starting-the-server)
  - [Accessing the Dashboard](#accessing-the-dashboard)
  - [Dashboard Features](#dashboard-features)
    - [Topic Management](#topic-management)
    - [Automation Rules](#automation-rules)
    - [Data Visualization](#data-visualization)
    - [Webhooks Integration](#webhooks-integration)
    - [Code Examples](#code-examples)
  - [Testing with the Client](#testing-with-the-client)
  - [Using Diagnostic Tools](#using-diagnostic-tools)
- [MQTT Client Library](#mqtt-client-library)
  - [Basic Usage](#basic-usage)
  - [Advanced Options](#advanced-options)
- [API Documentation](#api-documentation)
  - [Dashboard API](#dashboard-api)
  - [Automation API](#automation-api)
  - [History API](#history-api)
  - [Webhooks API](#webhooks-api)
- [Development](#development)
  - [Project Structure](#project-structure)
  - [Building from Source](#building-from-source)
  - [Running Tests](#running-tests)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview

Smart Lily MQTT Server is a comprehensive platform for IoT messaging and device management. It combines a high-performance MQTT broker with a user-friendly web dashboard, providing a complete solution for home automation, IoT device management, and real-time messaging applications.

## Features

- **MQTT Broker**
  - MQTT over TCP (port 1883 by default)
  - MQTT over WebSockets (port 8883 by default)
  - Support for QoS 0, 1, and 2
  - Retained messages
  - Last Will and Testament (LWT)
  - Clean/Persistent Sessions

- **Web Dashboard**
  - Real-time message monitoring
  - Topic management (subscribe, publish, view retained messages)
  - Client connection monitoring
  - Server statistics and performance metrics
  - User-friendly interface built with Bootstrap 5

- **Data Persistence**
  - Message history storage with SQLite database
  - Historical data querying and visualization
  - Persistent storage for automation rules
  - Message replay capabilities

- **Data Visualization**
  - Real-time charts and graphs for sensor data
  - Historical data visualization with time-range selection
  - Multiple visualization types (line charts, gauges)
  - Topic comparison capabilities
  - Customizable dashboards

- **Automation System**
  - IFTTT-style automation rules
  - Trigger actions based on topic values
  - Configurable conditions and operations
  - Multiple action types (publish, notify, execute)
  - Rule management interface

- **Webhooks Integration**
  - Connect Smart Lily to external services
  - Event-based triggers (messages, connections, automation rules)
  - Customizable webhook endpoints
  - Header customization for authentication
  - Event filtering

- **Code Examples**
  - Ready-to-use examples for ESP8266/ESP32
  - MicroPython implementations
  - Python client examples
  - Node.js integration examples
  - Web browser MQTT client examples

- **Diagnostic Tools**
  - Socket.IO diagnostic page for testing connectivity
  - Test publishing script for MQTT message testing
  - Enhanced logging for troubleshooting
  - Debug page with live event monitoring
  - Visual event tracing in browser

- **Administration**
  - Configurable via environment variables
  - Detailed logging with Winston
  - Client authentication/authorization options
  - Performance monitoring

## System Architecture

Smart Lily consists of several core components:

1. **MQTT Broker**: Powered by Aedes, a high-performance MQTT broker implementation
2. **Web Dashboard**: Express.js web server with EJS templates and Socket.IO for real-time updates
3. **Database**: SQLite-based persistence for message history and configuration
4. **Automation Engine**: Event-driven system for creating and executing automation rules
5. **Visualization Engine**: Chart.js-based data visualization system
6. **Webhooks Service**: Integration with external services via HTTP callbacks
7. **System Monitoring**: Real-time statistics and system health monitoring

## Prerequisites

- Node.js (v14 or newer)
- npm or yarn package manager
- Modern web browser for dashboard access

## Installation

```bash
# Clone the repository
git clone https://github.com/lily-osp/smart-lily.git
cd smart-lily

# Install dependencies
npm install

# Build the project
npm run build

# Set up configuration
cp config/default.env.example config/default.env
# Edit the configuration file as needed
```

## Configuration

Configuration is managed through environment variables, which can be set in `config/default.env`:

```
# MQTT Server Configuration
MQTT_PORT=1883        # MQTT TCP port
MQTT_WS_PORT=8883     # MQTT WebSocket port
HOST=0.0.0.0          # The host to bind to
LOG_LEVEL=info        # Logging level (error, warn, info, debug)

# Dashboard Configuration
DASHBOARD_PORT=3000   # Web Dashboard port

# Database Configuration
DB_PATH=./data/smartlily.db  # SQLite database path

# Security Configuration
ENABLE_AUTH=false     # Enable/disable authentication
```

## Usage

### Starting the Server

```bash
# Development mode (with ts-node)
npm run dev

# Production mode (after build)
npm run build
npm start
```

### Accessing the Dashboard

Once the server is running, access the web dashboard at:

```
http://localhost:3000
```

### Dashboard Features

#### Topic Management

The Topics Management page allows you to:
- View all active MQTT topics
- Publish messages to topics
- View retained messages
- Delete retained messages
- Monitor topic activity in real-time

#### Automation Rules

The Automation page enables you to create IFTTT-style rules:
- Define trigger conditions based on topic values
- Configure multiple actions when conditions are met
- Enable/disable rules
- Monitor rule execution history

#### Data Visualization

The Visualization page provides powerful data visualization tools:
- Create real-time line charts for numerical data from any topic
- Monitor current values with gauge charts
- Compare multiple topics on a single chart
- View historical data with customizable time ranges
- Export and share visualizations

#### Webhooks Integration

The Webhooks page allows you to connect Smart Lily to external services:
- Create webhook endpoints for different events
- Configure custom HTTP headers for authentication
- Test webhook connections
- Enable/disable webhooks
- Monitor webhook activity

#### Code Examples

The Code Examples page provides ready-to-use implementations for:
- ESP8266/ESP32 with Arduino
- MicroPython on ESP devices
- Python clients using paho-mqtt
- Node.js applications
- Web browser JavaScript clients

### Testing with the Client

A test client is included to verify the MQTT server functionality:

```bash
npm run test-client
```

This will:
1. Connect to the MQTT server
2. Subscribe to a test topic
3. Publish a message to the topic
4. Demonstrate the message being received

### Using Diagnostic Tools

Smart Lily includes several diagnostic tools to help troubleshoot issues:

#### Socket.IO Diagnostic Page

Access the Socket.IO diagnostic tool at:

```
http://localhost:3000/test-socket
```

This page will:
- Test Socket.IO connection to the server
- Display all events received in real-time
- Allow you to send test messages
- Show detailed event information

#### MQTT Test Publisher

Run the MQTT test publisher to verify MQTT broker functionality:

```bash
npx ts-node src/test-publish.ts
```

This script will:
- Connect to the MQTT broker
- Publish test messages to various topics
- Verify connection and publishing capabilities

#### Debug Page

Access the debug page at:

```
http://localhost:3000/debug
```

This page provides a simplified interface for seeing MQTT messages without the full dashboard UI.

## MQTT Client Library

Smart Lily includes a full-featured TypeScript MQTT client library.

### Basic Usage

```typescript
import { MqttClient } from './mqtt/client';

async function example() {
  // Create a client
  const client = new MqttClient('my-client-id');
  
  // Connect to the server
  await client.connect();
  
  // Subscribe to a topic
  await client.subscribe('home/temperature');
  
  // Publish a message
  await client.publish('home/temperature', JSON.stringify({ value: 23, unit: 'C' }));
  
  // Disconnect when done
  await client.disconnect();
}
```

### Advanced Options

```typescript
import { MqttClient } from './mqtt/client';

async function advancedExample() {
  const client = new MqttClient('advanced-client');
  
  // Connect with options
  await client.connect({
    keepalive: 30,
    clean: true,
    will: {
      topic: 'clients/advanced-client/status',
      payload: 'offline',
      qos: 1,
      retain: true
    }
  });
  
  // Subscribe with QoS
  await client.subscribe('sensors/#', { qos: 1 });
  
  // Publish with options
  await client.publish('actuators/light', 'ON', { 
    qos: 2, 
    retain: true 
  });
  
  // Handle incoming messages
  client.getClient().on('message', (topic, message) => {
    console.log(`Received message on ${topic}: ${message.toString()}`);
  });
}
```

## API Documentation

### Dashboard API

The dashboard provides a RESTful API for interacting with the MQTT server:

- `GET /api/stats` - Get server statistics
- `GET /api/topics` - Get all active topics
- `GET /api/topics/:topic` - Get information about a specific topic
- `POST /api/topics/:topic` - Publish a message to a topic
- `DELETE /api/topics/:topic` - Delete a retained message for a topic

### Automation API

The automation system provides API endpoints for managing automation rules:

- `GET /api/automation/rules` - Get all automation rules
- `GET /api/automation/rules/:id` - Get a specific rule
- `POST /api/automation/rules` - Create a new rule
- `PUT /api/automation/rules/:id` - Update an existing rule
- `DELETE /api/automation/rules/:id` - Delete a rule
- `POST /api/automation/rules/:id/enable` - Enable a rule
- `POST /api/automation/rules/:id/disable` - Disable a rule

### History API

The history system provides API endpoints for accessing message history:

- `GET /api/history` - Get recent messages across all topics
- `GET /api/history/:topic` - Get message history for a specific topic
- `GET /api/history/:topic?startTime=X&endTime=Y` - Get message history for a topic within a time range

### Webhooks API

The webhooks system provides API endpoints for managing webhook integrations:

- `GET /api/webhooks` - Get all webhooks
- `GET /api/webhooks/:id` - Get a specific webhook
- `POST /api/webhooks` - Create a new webhook
- `PUT /api/webhooks/:id` - Update an existing webhook
- `DELETE /api/webhooks/:id` - Delete a webhook
- `POST /api/webhooks/:id/enable` - Enable a webhook
- `POST /api/webhooks/:id/disable` - Disable a webhook
- `POST /api/webhooks/test` - Test a webhook URL

## Development

### Project Structure

```
smart-lily/
├── config/               # Configuration files
├── data/                 # SQLite database and data files
├── logs/                 # Log files
├── src/
│   ├── dashboard/        # Web dashboard
│   │   ├── public/       # Static assets
│   │   └── views/        # EJS templates
│   ├── mqtt/             # MQTT broker implementation
│   ├── utils/            # Utility functions
│   │   ├── automation.ts # Automation engine
│   │   ├── database.ts   # Database access
│   │   └── webhook.ts    # Webhooks service
│   └── index.ts          # Application entry point
├── tsconfig.json         # TypeScript configuration
└── package.json          # Project dependencies
```

### Building from Source

```bash
# Install development dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Run linting
npm run lint

# Format code
npm run format
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --grep "MQTT Client"
```

## Security

By default, the server allows all connections and operations. For production use, you'll want to implement proper authentication and authorization. Edit the `setupEventHandlers` method in `src/mqtt/server.ts` to implement your security logic.

Security recommendations:
- Enable authentication for production deployments
- Use TLS/SSL for all connections
- Implement proper access control for topics
- Regularly update dependencies
- Monitor system logs for suspicious activity

## Troubleshooting

Common issues and solutions:

- **Can't connect to MQTT server**: 
  - Check that ports 1883/8883 are open and not blocked by a firewall
  - Ensure you're using 127.0.0.1 (not 0.0.0.0) for local connections
  - Verify the MQTT broker is running with `ss -tulnp | grep node`

- **Dashboard shows no connection**: 
  - Ensure WebSocket connections are allowed if behind a proxy
  - Check browser console for Socket.IO connection errors
  - Use the Socket.IO diagnostic page at `/test-socket` to verify connectivity

- **Socket.IO connection issues**:
  - Enable debug logging with `localStorage.debug = '*'` in browser console
  - Check for CORS issues if connecting from a different domain
  - Verify the Socket.IO server is properly initialized

- **MQTT messages not appearing in dashboard**:
  - Check that the topics match exactly (case-sensitive)
  - Verify message format (use valid JSON if expected)
  - Use the test publisher script to verify broker functionality
  - Check server logs for message processing errors

- **High memory usage**: 
  - Check for retained messages with large payloads
  - Monitor client connection count for abnormal growth

- **Automation rules not triggering**: 
  - Verify topic names and condition logic
  - Check rule status (enabled/disabled)
  - Inspect logs for rule evaluation

- **Database errors**: 
  - Check file permissions for the data directory
  - Verify SQLite is properly installed

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

ISC 