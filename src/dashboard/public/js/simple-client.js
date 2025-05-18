// Simple socket.io diagnostic client
document.addEventListener('DOMContentLoaded', function() {
    console.log('Simple diagnostic client loaded');
    
    // Create a diagnostic output div
    const diagOutput = document.createElement('div');
    diagOutput.id = 'diag-output';
    diagOutput.style.padding = '20px';
    diagOutput.style.margin = '20px';
    diagOutput.style.border = '1px solid #ccc';
    diagOutput.style.borderRadius = '5px';
    diagOutput.style.whiteSpace = 'pre-wrap';
    diagOutput.style.fontFamily = 'monospace';
    diagOutput.style.maxHeight = '500px';
    diagOutput.style.overflow = 'auto';
    document.body.appendChild(diagOutput);
    
    // Create a controls div
    const controlsDiv = document.createElement('div');
    controlsDiv.style.padding = '20px';
    controlsDiv.style.margin = '20px';
    controlsDiv.style.display = 'flex';
    controlsDiv.style.gap = '10px';
    document.body.appendChild(controlsDiv);
    
    // Create a clear button
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear Log';
    clearBtn.onclick = function() {
        diagOutput.innerHTML = '';
    };
    controlsDiv.appendChild(clearBtn);
    
    // Create a test topic publish form
    const publishForm = document.createElement('form');
    publishForm.style.display = 'flex';
    publishForm.style.gap = '10px';
    
    const topicInput = document.createElement('input');
    topicInput.type = 'text';
    topicInput.placeholder = 'Topic';
    topicInput.value = 'test/topic';
    publishForm.appendChild(topicInput);
    
    const messageInput = document.createElement('input');
    messageInput.type = 'text';
    messageInput.placeholder = 'Message';
    messageInput.value = '{"test": "message"}';
    publishForm.appendChild(messageInput);
    
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.textContent = 'Publish';
    publishForm.appendChild(submitBtn);
    
    controlsDiv.appendChild(publishForm);
    
    // Helper function to add log messages
    function log(message, type = 'info') {
        const line = document.createElement('div');
        line.className = `log-${type}`;
        line.style.marginBottom = '5px';
        
        if (type === 'error') {
            line.style.color = 'red';
        } else if (type === 'success') {
            line.style.color = 'green';
        } else if (type === 'warning') {
            line.style.color = 'orange';
        }
        
        const timestamp = new Date().toISOString();
        line.textContent = `[${timestamp}] ${message}`;
        diagOutput.appendChild(line);
        diagOutput.scrollTop = diagOutput.scrollHeight;
    }
    
    // Try to connect to Socket.IO
    log('Checking for Socket.IO availability');
    if (typeof io === 'undefined') {
        log('ERROR: Socket.IO is not available! Check if the script is loaded correctly.', 'error');
        return;
    }
    
    log('Socket.IO is available, attempting to connect...');
    
    try {
        const socket = io();
        log('Socket.IO connection initialized');
        
        // Connection events
        socket.on('connect', () => {
            log(`Socket connected successfully, ID: ${socket.id}`, 'success');
            
            // Subscribe to all topics
            socket.emit('subscribe', { topic: '#' });
            log('Subscribed to all topics (#)');
        });
        
        socket.on('connect_error', (error) => {
            log(`Socket connection error: ${error.message}`, 'error');
        });
        
        socket.on('disconnect', () => {
            log('Socket disconnected', 'warning');
        });
        
        socket.on('reconnect', (attempt) => {
            log(`Socket reconnected after ${attempt} attempts`, 'success');
        });
        
        socket.on('reconnect_attempt', (attempt) => {
            log(`Socket reconnection attempt #${attempt}`, 'warning');
        });
        
        socket.on('reconnect_error', (error) => {
            log(`Socket reconnection error: ${error.message}`, 'error');
        });
        
        socket.on('reconnect_failed', () => {
            log('Socket reconnection failed', 'error');
        });
        
        // MQTT-specific events
        socket.on('mqtt-message', (data) => {
            let payloadStr;
            try {
                payloadStr = typeof data.payload === 'object' ? 
                    JSON.stringify(data.payload) : data.payload;
            } catch (e) {
                payloadStr = `[Error stringifying payload: ${e.message}]`;
            }
            
            log(`MQTT message received - Topic: ${data.topic}`, 'success');
            log(`Payload: ${payloadStr}`);
        });
        
        socket.on('client_connected', (data) => {
            log(`Client connected: ${data.clientId}`, 'success');
        });
        
        socket.on('client_disconnected', (data) => {
            log(`Client disconnected: ${data.clientId}`, 'warning');
        });
        
        // Handle publish form
        publishForm.onsubmit = function(e) {
            e.preventDefault();
            const topic = topicInput.value.trim();
            let message = messageInput.value.trim();
            
            // Try to parse as JSON if it looks like JSON
            if (message.startsWith('{') || message.startsWith('[')) {
                try {
                    message = JSON.parse(message);
                    log(`Publishing to ${topic} with JSON payload: ${JSON.stringify(message)}`);
                } catch (e) {
                    log(`Warning: Message looks like JSON but couldn't be parsed. Publishing as string.`, 'warning');
                }
            } else {
                log(`Publishing to ${topic} with string payload: ${message}`);
            }
            
            socket.emit('publish', {
                topic,
                message,
                retain: false
            });
        };
        
        // Subscribe to specific publish events
        socket.on('publish_success', (data) => {
            log(`Published to ${data.topic} successfully`, 'success');
        });
        
        socket.on('publish_error', (data) => {
            log(`Error publishing: ${data.error}`, 'error');
        });
        
        socket.on('subscribe_success', (data) => {
            log(`Subscribed to ${data.topic} successfully`, 'success');
        });
        
        socket.on('subscribe_error', (data) => {
            log(`Error subscribing: ${data.error}`, 'error');
        });
        
    } catch (e) {
        log(`Error initializing Socket.IO: ${e.message}`, 'error');
    }
}); 