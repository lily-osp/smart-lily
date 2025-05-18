// Socket.IO diagnostic tool
document.addEventListener('DOMContentLoaded', function() {
    console.log('Socket.IO diagnostic tool loaded');
    
    // Create diagnostic elements
    const container = document.createElement('div');
    container.style.padding = '20px';
    container.style.fontFamily = 'monospace';
    document.body.appendChild(container);
    
    const statusEl = document.createElement('div');
    statusEl.style.padding = '10px';
    statusEl.style.margin = '10px 0';
    statusEl.style.border = '1px solid #ccc';
    statusEl.style.borderRadius = '5px';
    statusEl.textContent = 'Initializing...';
    container.appendChild(statusEl);
    
    const eventsEl = document.createElement('div');
    eventsEl.style.padding = '10px';
    eventsEl.style.margin = '10px 0';
    eventsEl.style.border = '1px solid #ccc';
    eventsEl.style.borderRadius = '5px';
    eventsEl.style.maxHeight = '400px';
    eventsEl.style.overflow = 'auto';
    container.appendChild(eventsEl);
    
    const controlsEl = document.createElement('div');
    controlsEl.style.padding = '10px';
    controlsEl.style.margin = '10px 0';
    controlsEl.style.border = '1px solid #ccc';
    controlsEl.style.borderRadius = '5px';
    container.appendChild(controlsEl);
    
    const sendMsgBtn = document.createElement('button');
    sendMsgBtn.textContent = 'Send Test Message';
    sendMsgBtn.style.padding = '8px 16px';
    sendMsgBtn.style.margin = '5px';
    controlsEl.appendChild(sendMsgBtn);
    
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear Log';
    clearBtn.style.padding = '8px 16px';
    clearBtn.style.margin = '5px';
    controlsEl.appendChild(clearBtn);
    
    function log(message, type = 'info') {
        const entry = document.createElement('div');
        entry.textContent = `[${new Date().toISOString()}] ${message}`;
        
        if (type === 'error') {
            entry.style.color = 'red';
        } else if (type === 'success') {
            entry.style.color = 'green';
        } else if (type === 'event') {
            entry.style.color = 'blue';
        }
        
        eventsEl.appendChild(entry);
        eventsEl.scrollTop = eventsEl.scrollHeight;
    }
    
    // Check for Socket.IO
    if (typeof io === 'undefined') {
        statusEl.textContent = 'ERROR: Socket.IO not available!';
        statusEl.style.backgroundColor = '#ffdddd';
        log('Socket.IO is not defined. Make sure it is properly included in the page.', 'error');
        return;
    }
    
    // Connect to Socket.IO
    let socket;
    try {
        log('Attempting to connect to Socket.IO server...');
        socket = io();
        
        socket.on('connect', () => {
            statusEl.textContent = `Connected: ${socket.id}`;
            statusEl.style.backgroundColor = '#ddffdd';
            log('Socket.IO connected successfully!', 'success');
            
            // Record all events that come in
            const originalOnevent = socket.onevent;
            socket.onevent = function(packet) {
                const args = packet.data || [];
                log(`Event received: ${args[0]}`, 'event');
                try {
                    log(`Data: ${JSON.stringify(args.slice(1))}`);
                } catch (e) {
                    log(`Data: [Could not stringify - ${e.message}]`);
                }
                originalOnevent.call(this, packet);
            };
            
            // Subscribe to all topics
            socket.emit('subscribe', { topic: '#' });
            log('Subscribed to all topics (#)');
        });
        
        socket.on('connect_error', (error) => {
            statusEl.textContent = `Connection Error: ${error.message}`;
            statusEl.style.backgroundColor = '#ffdddd';
            log(`Socket.IO connection error: ${error.message}`, 'error');
        });
        
        socket.on('disconnect', (reason) => {
            statusEl.textContent = `Disconnected: ${reason}`;
            statusEl.style.backgroundColor = '#ffdddd';
            log(`Socket.IO disconnected: ${reason}`, 'error');
        });
        
        // Handle publish form
        sendMsgBtn.addEventListener('click', () => {
            if (!socket.connected) {
                log('Cannot send message: Not connected', 'error');
                return;
            }
            
            const topic = 'test/diagnostics';
            const message = {
                type: 'diagnostic',
                timestamp: Date.now(),
                value: Math.random() * 100
            };
            
            log(`Publishing message to ${topic}: ${JSON.stringify(message)}`);
            socket.emit('publish', {
                topic,
                message,
                retain: false
            });
        });
        
        // Clear log
        clearBtn.addEventListener('click', () => {
            eventsEl.innerHTML = '';
        });
        
    } catch (e) {
        statusEl.textContent = `Error: ${e.message}`;
        statusEl.style.backgroundColor = '#ffdddd';
        log(`Error initializing Socket.IO: ${e.message}`, 'error');
    }
}); 