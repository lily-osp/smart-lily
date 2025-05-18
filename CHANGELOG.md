# Changelog

All notable changes to the Smart Lily MQTT Server will be documented in this file.

## [Unreleased]

### Added
- Socket.IO diagnostic tool (`/test-socket`) for connectivity testing
- Test MQTT publisher script (`test-publish.ts`) for verifying message flow
- Enhanced logging for Socket.IO events and MQTT message processing
- More detailed error reporting for connection issues

### Fixed
- TypeScript compilation errors in DashboardServer class
- MQTT client connection issues by ensuring 127.0.0.1 is used for local connections
- Socket.IO message forwarding from MQTT broker to browser clients
- Improved error handling in MQTT message processing
- Issues with duplicate route definitions
- Dashboard message display and dynamic topic card generation
- Browser compatibility issues with topic card templates

## [1.1.0] - 2023-07-20

### Added
- **Data Persistence**
  - SQLite database integration for message history storage
  - Persistent storage for automation rules
  - Database access layer with TypeORM
  - APIs for querying historical data

- **Data Visualization**
  - New visualization page in the dashboard
  - Real-time line charts for numerical data
  - Gauge charts for current values
  - Topic comparison functionality
  - Time-range selection for historical data
  - Chart.js integration for responsive charts

- **Webhooks Integration**
  - Webhooks system for external service integration
  - Configurable event triggers (messages, connections, automation, system)
  - Custom HTTP headers for authentication
  - Webhook management UI
  - Webhook testing functionality
  - API for webhook management

### Changed
- Updated project architecture to initialize database before server start
- Improved error handling in MQTT message processing
- Enhanced documentation with new features
- Updated navigation to include visualization and webhooks pages

### Fixed
- Issue with MQTT client reconnection
- Automation rule initialization on server restart

## [1.0.0] - 2023-06-15

### Added
- Initial release of Smart Lily MQTT Server
- MQTT broker functionality with TCP and WebSocket support
- Web dashboard for monitoring and management
- Topic management interface
- Automation rules system
- Code examples for various platforms
- Comprehensive documentation 