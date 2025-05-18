import { MqttClient } from './client';
import logger from '../utils/logger';
import axios from 'axios';
import os from 'os';
import { config } from '../config';
import * as ntp from 'ntp-time';

export class SystemTopicsManager {
  private mqttClient: MqttClient;
  private intervals: NodeJS.Timeout[] = [];
  private isRunning: boolean = false;
  private ntpClient: ntp.Client;
  private startTime: number = Date.now(); // Store app start time
  
  constructor() {
    this.mqttClient = new MqttClient('system-topics-publisher');
    this.ntpClient = new ntp.Client('pool.ntp.org', 123, { timeout: 5000 });
  }
  
  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    
    try {
      // Connect to MQTT broker
      await this.mqttClient.connect();
      this.isRunning = true;
      this.startTime = Date.now(); // Reset start time when system topics manager starts
      logger.info('System topics manager started');
      
      // Start publishing system topics
      this.setupTimeAndDateTopics();
      this.setupSystemInfoTopics();
      // Remove unnecessary topics
      // this.setupWeatherTopic();
      // this.setupNewsHeadlinesTopic();
      // this.setupCryptoPriceTopic();
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Failed to start system topics manager: ${error.message}`);
      }
      throw error;
    }
  }
  
  public stop(): void {
    // Clear all intervals
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    
    // Disconnect MQTT client
    this.mqttClient.disconnect().catch(err => {
      logger.error(`Error disconnecting system topics publisher: ${err.message}`);
    });
    
    this.isRunning = false;
    logger.info('System topics manager stopped');
  }
  
  private async setupTimeAndDateTopics(): Promise<void> {
    // Initial publish using NTP
    await this.publishNtpTime();
    
    // Publish time and date at the configured interval
    const interval = setInterval(async () => {
      await this.publishNtpTime();
    }, config.system.updateIntervals.time);
    
    this.intervals.push(interval);
  }
  
  private async publishNtpTime(): Promise<void> {
    try {
      // Get NTP time - wrap in try/catch since this can fail
      const ntpTime = await this.ntpClient.syncTime();
      const now = ntpTime.time;
      
      // Debug log NTP time details
      logger.debug(`NTP time synchronized: ${now.toISOString()}`);
      
      // ISO format time
      await this.mqttClient.publish('system/time/iso', now.toISOString(), { retain: true });
      
      // Human readable time
      await this.mqttClient.publish('system/time/readable', now.toLocaleTimeString(), { retain: true });
      
      // Date components
      await this.mqttClient.publish('system/date', JSON.stringify({
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
        weekday: now.toLocaleDateString(undefined, { weekday: 'long' })
      }), { retain: true });
      
      // Unix timestamp
      await this.mqttClient.publish('system/time/unix', now.getTime().toString(), { retain: true });
      
      logger.debug('Published NTP time data');
    } catch (error) {
      // If NTP fails, use system time as fallback
      logger.warn('NTP time fetch failed, using system time as fallback');
      const now = new Date();
      
      // ISO format time
      await this.mqttClient.publish('system/time/iso', now.toISOString(), { retain: true });
      
      // Human readable time
      await this.mqttClient.publish('system/time/readable', now.toLocaleTimeString(), { retain: true });
      
      // Date components
      await this.mqttClient.publish('system/date', JSON.stringify({
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
        weekday: now.toLocaleDateString(undefined, { weekday: 'long' })
      }), { retain: true });
      
      // Unix timestamp
      await this.mqttClient.publish('system/time/unix', now.getTime().toString(), { retain: true });
      
      logger.warn('Published system time as fallback for NTP');
    }
  }
  
  private setupSystemInfoTopics(): void {
    // Ensure initial publish happens immediately
    this.publishSystemInfo();
    
    // Publish system information at the configured interval
    const interval = setInterval(() => {
      this.publishSystemInfo();
    }, config.system.updateIntervals.system);
    
    this.intervals.push(interval);
  }
  
  private publishSystemInfo(): void {
    // Application uptime (not system uptime)
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    this.mqttClient.publish('system/uptime', uptime.toString(), { retain: true });
    logger.debug(`Published application uptime: ${uptime}s`);
    
    // Memory usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryUsage = {
      total: this.formatBytes(totalMem),
      free: this.formatBytes(freeMem),
      used: this.formatBytes(usedMem),
      percentUsed: Math.round((usedMem / totalMem) * 100)
    };
    this.mqttClient.publish('system/memory', JSON.stringify(memoryUsage), { retain: true });
    logger.debug(`Published memory info: ${JSON.stringify(memoryUsage)}`);
    
    // CPU load
    const loadAvg = os.loadavg();
    const cpuLoad = {
      '1min': loadAvg[0],
      '5min': loadAvg[1],
      '15min': loadAvg[2]
    };
    this.mqttClient.publish('system/cpu/load', JSON.stringify(cpuLoad), { retain: true });
    logger.debug(`Published CPU load: ${JSON.stringify(cpuLoad)}`);
    
    // Network interfaces
    const networkInterfaces = os.networkInterfaces();
    const networkInfo = Object.entries(networkInterfaces).reduce((acc, [name, interfaces]) => {
      if (interfaces) {
        const ipv4 = interfaces.find(iface => iface.family === 'IPv4');
        if (ipv4) {
          acc[name] = {
            address: ipv4.address,
            netmask: ipv4.netmask,
            mac: ipv4.mac
          };
        }
      }
      return acc;
    }, {} as Record<string, any>);
    
    this.mqttClient.publish('system/network', JSON.stringify(networkInfo), { retain: true });
    logger.debug(`Published network info for interfaces: ${Object.keys(networkInfo).join(', ')}`);
    
    logger.info('Published all system info data');
  }
  
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;
    
    while (value > 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }
    
    return `${value.toFixed(2)} ${units[unitIndex]}`;
  }
} 