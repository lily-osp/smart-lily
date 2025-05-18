document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard initializing...');
    
    // Connect to Socket.IO server
    const socket = io();
    
    // DOM elements
    const statusBadge = document.getElementById('status-badge');
    const messageList = document.getElementById('message-list');
    const clientList = document.getElementById('client-list');
    const topicList = document.getElementById('topic-list');
    const topicFilter = document.getElementById('topic-filter');
    const clearMessagesBtn = document.getElementById('clear-messages');
    const publishForm = document.getElementById('publish-form');
    const subscribeForm = document.getElementById('subscribe-form');
    const uptimeElement = document.getElementById('uptime');
    const clientCountElement = document.getElementById('client-count');
    const messageCountElement = document.getElementById('message-count');
    const topicCountElement = document.getElementById('topic-count');
    const dynamicTopicCardsContainer = document.getElementById('dynamic-topic-cards');
    const topicCardTemplate = document.getElementById('topic-card-template');
    
    // Debug logging to check if all DOM elements are found
    console.log('Uptime element found:', !!uptimeElement);
    console.log('Dynamic topic cards container found:', !!dynamicTopicCardsContainer);
    console.log('Topic card template found:', !!topicCardTemplate);
    console.log('Topic list element found:', !!topicList);
    console.log('Client list element found:', !!clientList);
    
    // System topic elements
    const systemTimeIso = document.getElementById('system-time-iso');
    const systemTimeReadable = document.getElementById('system-time-readable');
    const systemDate = document.getElementById('system-date');
    const systemTimeUnix = document.getElementById('system-time-unix');
    const systemUptime = document.getElementById('system-uptime');
    const systemMemory = document.getElementById('system-memory');
    const systemCpuLoad = document.getElementById('system-cpu-load');
    const systemNetwork = document.getElementById('system-network');
    
    // History logs
    const timeHistoryLog = document.getElementById('time-history-log');
    const systemHistoryLog = document.getElementById('system-history-log');
    const networkHistoryLog = document.getElementById('network-history-log');
    
    // Application state
    let isConnected = false;
    let messages = [];
    let clients = [];
    let topics = new Map();
    let topicHistory = new Map(); // Store history for each topic
    let knownSystemTopics = new Set([
        'system/time/iso', 'system/time/readable', 'system/date', 'system/time/unix',
        'system/uptime', 'system/memory', 'system/cpu/load', 'system/network'
    ]);
    let dynamicTopicCards = new Map(); // Store dynamic topic cards
    let statsInterval;
    const MAX_HISTORY_ITEMS = 20; // Maximum history items per topic
    
    // Set initial connection status
    setConnectionStatus('connecting');
    
    // Explicitly subscribe to all topics once connected
    function subscribeToAllTopics() {
        console.log('Subscribing to system topics...');
        socket.emit('subscribe', { topic: 'system/#' });
        
        console.log('Subscribing to all topics...');
        socket.emit('subscribe', { topic: '#' });
        
        // Also subscribe to specific topics we're interested in
        const specificTopics = [
            'sensor/#',
            'device/#',
            'control/#',
            'status/#'
        ];
        
        specificTopics.forEach(topic => {
            console.log(`Subscribing to ${topic}...`);
            socket.emit('subscribe', { topic });
        });
    }
    
    // Socket.IO event handlers
    socket.on('connect', () => {
        console.log('Connected to server');
        setConnectionStatus('connected');
        isConnected = true;
        
        // Start updating stats
        startStatsUpdates();
        
        // Add system message
        addMessage({
            topic: 'system',
            message: 'Connected to MQTT dashboard',
            time: new Date().toISOString(),
            type: 'system'
        });
        
        // Subscribe to all topics
        subscribeToAllTopics();
        
        // For testing purposes, let's generate sample system data if none is available after 3 seconds
        setTimeout(() => {
            if (systemTimeIso.textContent === '--') {
                console.log('No system time data received, using client-side fallback');
                
                // Simulate system time data
                const now = new Date();
                handleSystemTopic('system/time/iso', now.toISOString());
                handleSystemTopic('system/time/readable', now.toLocaleTimeString());
                handleSystemTopic('system/date', JSON.stringify({
                    year: now.getFullYear(),
                    month: now.getMonth() + 1,
                    day: now.getDate(),
                    weekday: now.toLocaleDateString(undefined, { weekday: 'long' })
                }));
                handleSystemTopic('system/time/unix', now.getTime().toString());
                
                // Simulate system uptime
                const uptime = 120; // 2 minutes in seconds
                handleSystemTopic('system/uptime', uptime.toString());
                
                // Simulate memory information
                handleSystemTopic('system/memory', JSON.stringify({
                    total: '8.00 GB',
                    used: '4.50 GB',
                    free: '3.50 GB',
                    percentUsed: 56
                }));
                
                // Simulate CPU load
                handleSystemTopic('system/cpu/load', JSON.stringify({
                    '1min': 0.25,
                    '5min': 0.30,
                    '15min': 0.35
                }));
                
                // Simulate network information
                handleSystemTopic('system/network', JSON.stringify({
                    'eth0': {
                        address: '192.168.1.100',
                        netmask: '255.255.255.0',
                        mac: '00:11:22:33:44:55'
                    },
                    'wlan0': {
                        address: '192.168.1.101',
                        netmask: '255.255.255.0',
                        mac: 'AA:BB:CC:DD:EE:FF'
                    }
                }));
                
                // Generate some sample topics for testing dynamic card creation
                ['sensor/temperature', 'sensor/humidity', 'device/light', 'status/battery'].forEach(topic => {
                    let message;
                    switch (topic) {
                        case 'sensor/temperature':
                            message = JSON.stringify({ value: 22.5, unit: '°C', status: 'normal' });
                            break;
                        case 'sensor/humidity':
                            message = JSON.stringify({ value: 45, unit: '%', status: 'normal' });
                            break;
                        case 'device/light':
                            message = JSON.stringify({ state: 'ON', brightness: 75 });
                            break;
                        case 'status/battery':
                            message = JSON.stringify({ level: 85, charging: false });
                            break;
                    }
                    handleDynamicTopic(topic, JSON.parse(message), new Date().toISOString());
                });
            }
        }, 3000);
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        setConnectionStatus('disconnected');
        isConnected = false;
        
        // Stop updating stats
        clearInterval(statsInterval);
        
        // Add error message
        addMessage({
            topic: 'system',
            message: 'Disconnected from MQTT dashboard',
            time: new Date().toISOString(),
            type: 'error'
        });
    });
    
    // Handle incoming MQTT messages
    socket.on('mqtt-message', (data) => {
        console.log('Received MQTT message:', data);
        console.log('Message topic:', data.topic);
        console.log('Message payload:', data.payload);
        console.log('Message type:', typeof data.payload);
        
        // Ensure message is properly formatted
        let parsedMessage = data.payload;
        if (typeof data.payload === 'string' && (data.payload.startsWith('{') || data.payload.startsWith('['))) {
            try {
                parsedMessage = JSON.parse(data.payload);
                console.log('Successfully parsed message as JSON:', parsedMessage);
            } catch (e) {
                console.log('Failed to parse message as JSON:', e);
                parsedMessage = data.payload;
            }
        }
        
        // Add message to the list
        addMessage({
            topic: data.topic,
            message: parsedMessage,
            time: data.timestamp
        });
        
        // Update topics
        if (!topics.has(data.topic)) {
            topics.set(data.topic, 0);
            updateTopicList();
        }
        
        // Add to topic history
        addToTopicHistory(data.topic, parsedMessage, data.timestamp);
        
        // Handle system topics
        if (isSystemTopic(data.topic)) {
            console.log('Processing system topic:', data.topic);
            handleSystemTopic(data.topic, parsedMessage);
        } else {
            // Handle dynamic topics - everything that's not a system topic
            console.log('Processing dynamic topic:', data.topic);
            handleDynamicTopic(data.topic, parsedMessage, data.timestamp);
        }
    });
    
    // Handle client connections
    socket.on('client_connected', (data) => {
        console.log('Client connected event received:', data);
        if (!clients.includes(data.clientId)) {
            clients.push(data.clientId);
            console.log('Updated clients list:', clients);
            updateClientList();
        }
        
        addMessage({
            topic: 'system',
            message: `Client connected: ${data.clientId}`,
            time: new Date().toISOString(),
            type: 'system'
        });
    });
    
    // Handle client disconnections
    socket.on('client_disconnected', (data) => {
        console.log('Client disconnected event received:', data);
        clients = clients.filter(id => id !== data.clientId);
        console.log('Updated clients list after disconnect:', clients);
        updateClientList();
        
        addMessage({
            topic: 'system',
            message: `Client disconnected: ${data.clientId}`,
            time: new Date().toISOString(),
            type: 'system'
        });
    });
    
    // Handle publish success/error
    socket.on('publish_success', (data) => {
        showToast('Message published successfully', 'success');
    });
    
    socket.on('publish_error', (data) => {
        showToast(`Failed to publish: ${data.error}`, 'danger');
    });
    
    // Handle subscribe success/error
    socket.on('subscribe_success', (data) => {
        showToast(`Subscribed to ${data.topic}`, 'success');
    });
    
    socket.on('subscribe_error', (data) => {
        showToast(`Failed to subscribe: ${data.error}`, 'danger');
    });
    
    // Form handlers
    if (publishForm) {
        publishForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const topic = document.getElementById('pub-topic').value;
            const message = document.getElementById('pub-message').value;
            const retain = document.getElementById('retain-flag').checked;
            
            // Try to parse as JSON if possible
            let messageToSend = message;
            try {
                // Check if the message is valid JSON
                const parsed = JSON.parse(message);
                messageToSend = parsed;
            } catch (e) {
                // If not valid JSON, send as plain text
                messageToSend = message;
            }
            
            // Send to server
            socket.emit('publish', {
                topic,
                message: messageToSend,
                retain
            });
        });
    }
    
    if (subscribeForm) {
        subscribeForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const topic = document.getElementById('sub-topic').value;
            
            // Send to server
            socket.emit('subscribe', { topic });
        });
    }
    
    // Clear messages
    if (clearMessagesBtn) {
        clearMessagesBtn.addEventListener('click', () => {
            messages = [];
            messageList.innerHTML = '';
        });
    }
    
    // Filter messages by topic
    if (topicFilter) {
        topicFilter.addEventListener('input', () => {
            renderMessages();
        });
    }
    
    // Helper functions
    function setConnectionStatus(status) {
        if (!statusBadge) return;
        
        statusBadge.innerHTML = status === 'connected' ? 
            '<i class="fas fa-plug me-1"></i>Connected' : 
            (status === 'disconnected' ? 
                '<i class="fas fa-plug-circle-xmark me-1"></i>Disconnected' : 
                '<i class="fas fa-plug-circle-exclamation me-1"></i>Connecting');
        
        statusBadge.className = `badge`;
        
        switch (status) {
            case 'connected':
                statusBadge.classList.add('bg-success');
                break;
            case 'disconnected':
                statusBadge.classList.add('bg-danger', 'status-disconnected');
                break;
            case 'connecting':
                statusBadge.classList.add('bg-warning', 'status-connecting');
                break;
        }
    }
    
    function addMessage(message) {
        messages.unshift(message);
        
        // Limit to 100 messages
        if (messages.length > 100) {
            messages.pop();
        }
        
        // Render messages
        renderMessages();
    }
    
    function renderMessages() {
        if (!messageList) return;
        
        const filter = topicFilter ? topicFilter.value.toLowerCase() : '';
        
        const filteredMessages = filter ? 
            messages.filter(msg => msg.topic.toLowerCase().includes(filter)) : 
            messages;
            
        messageList.innerHTML = '';
        
        filteredMessages.forEach(msg => {
            const messageEl = document.createElement('div');
            messageEl.className = `message-item fade-in ${msg.type ? msg.type + '-message' : ''}`;
            
            let messageContent = '';
            if (typeof msg.message === 'object') {
                messageContent = JSON.stringify(msg.message, null, 2);
            } else {
                messageContent = msg.message.toString();
            }
            
            // Choose icon based on topic
            let icon = 'fa-message';
            if (msg.topic.startsWith('system/time')) icon = 'fa-clock';
            else if (msg.topic.startsWith('system/date')) icon = 'fa-calendar';
            else if (msg.topic.startsWith('system/memory')) icon = 'fa-memory';
            else if (msg.topic.startsWith('system/cpu')) icon = 'fa-microchip';
            else if (msg.topic.startsWith('system/uptime')) icon = 'fa-hourglass';
            else if (msg.topic.startsWith('system/network')) icon = 'fa-network-wired';
            else if (msg.topic === 'system') icon = 'fa-info-circle';
            else if (msg.topic.includes('sensor')) icon = 'fa-thermometer-half';
            else if (msg.topic.includes('device')) icon = 'fa-microchip';
            else if (msg.topic.includes('control')) icon = 'fa-sliders';
            else if (msg.topic.includes('status')) icon = 'fa-info-circle';
            
            messageEl.innerHTML = `
                <div class="message-topic">
                    <i class="fas ${icon} me-2"></i>${msg.topic}
                    <span class="message-time">${formatTime(msg.time)}</span>
                </div>
                <div class="message-payload">${messageContent}</div>
            `;
            
            messageList.appendChild(messageEl);
        });
        
        // Update message count
        if (messageCountElement) {
            messageCountElement.textContent = messages.length;
        }
    }
    
    function updateClientList() {
        if (!clientList) return;
        
        clientList.innerHTML = '';
        
        if (clients.length === 0) {
            const li = document.createElement('li');
            li.className = 'list-group-item text-center text-muted';
            li.textContent = 'No clients connected';
            clientList.appendChild(li);
            return;
        }
        
        clients.forEach(clientId => {
            const li = document.createElement('li');
            li.className = 'list-group-item';
            li.textContent = clientId;
            clientList.appendChild(li);
        });
        
        // Update client count
        if (clientCountElement) {
            clientCountElement.textContent = clients.length;
        }
    }
    
    function updateTopicList() {
        if (!topicList) return;
        
        topicList.innerHTML = '';
        
        if (topics.size === 0) {
            const li = document.createElement('li');
            li.className = 'list-group-item text-center text-muted';
            li.textContent = 'No active topics';
            topicList.appendChild(li);
            return;
        }
        
        Array.from(topics.keys()).sort().forEach(topic => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            
            const topicText = document.createElement('span');
            topicText.textContent = topic;
            topicText.style.overflow = 'hidden';
            topicText.style.textOverflow = 'ellipsis';
            
            const subscribeBtn = document.createElement('button');
            subscribeBtn.className = 'btn btn-sm btn-outline-secondary';
            subscribeBtn.textContent = 'Filter';
            subscribeBtn.addEventListener('click', () => {
                if (topicFilter) {
                    topicFilter.value = topic;
                    renderMessages();
                }
            });
            
            li.appendChild(topicText);
            li.appendChild(subscribeBtn);
            topicList.appendChild(li);
        });
        
        // Update topic count
        if (topicCountElement) {
            topicCountElement.textContent = topics.size;
        }
    }
    
    function formatTime(timeString) {
        const date = new Date(timeString);
        return date.toLocaleTimeString();
    }
    
    function formatUptime(seconds) {
        console.log('formatUptime called with input:', seconds, 'type:', typeof seconds);
        
        // Ensure we have a number
        if (typeof seconds === 'string') {
            seconds = parseInt(seconds, 10);
        }
        
        if (typeof seconds !== 'number' || isNaN(seconds)) {
            console.error('Invalid uptime value:', seconds);
            return '0s';
        }
        
        // Handle zero case
        if (seconds === 0) return '0s';
        
        // Log the uptime value for debugging
        console.log('Formatting uptime from seconds:', seconds);
        
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        
        let formatted = '';
        
        if (days > 0) {
            formatted += `${days}d `;
        }
        
        if (hours > 0 || days > 0) {
            formatted += `${hours}h `;
        }
        
        if (minutes > 0 || hours > 0 || days > 0) {
            formatted += `${minutes}m `;
        }
        
        formatted += `${remainingSeconds}s`;
        
        console.log('Formatted uptime:', formatted);
        return formatted;
    }
    
    function startStatsUpdates() {
        // Initial update
        updateStats();
        
        // Update every 5 seconds
        statsInterval = setInterval(updateStats, 5000);
    }
    
    function updateStats() {
        fetch('/api/stats')
            .then(response => response.json())
            .then(data => {
                uptimeElement.textContent = formatUptime(data.uptime);
                clientCountElement.textContent = data.connectedClients;
                messageCountElement.textContent = data.messageCount;
                topicCountElement.textContent = data.activeTopics.length;
                
                // Update topics
                data.activeTopics.forEach(topic => {
                    if (!topics.has(topic.topic)) {
                        topics.set(topic.topic, topic.subscribers);
                    }
                });
                
                updateTopicList();
            })
            .catch(error => {
                console.error('Error fetching stats:', error);
            });
    }
    
    function showToast(message, type = 'info') {
        // Create toast container if it doesn't exist
        let toastContainer = document.querySelector('.toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }
        
        // Create toast element
        const toastEl = document.createElement('div');
        toastEl.className = `toast align-items-center text-white bg-${type} border-0 fade-in`;
        toastEl.setAttribute('role', 'alert');
        toastEl.setAttribute('aria-live', 'assertive');
        toastEl.setAttribute('aria-atomic', 'true');
        
        toastEl.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;
        
        toastContainer.appendChild(toastEl);
        
        // Initialize Bootstrap toast
        const toast = new bootstrap.Toast(toastEl, {
            autohide: true,
            delay: 3000
        });
        
        toast.show();
        
        // Remove after hiding
        toastEl.addEventListener('hidden.bs.toast', () => {
            toastEl.remove();
        });
    }
    
    // Check if a topic is a system topic
    function isSystemTopic(topic) {
        return knownSystemTopics.has(topic) || topic.startsWith('system/');
    }
    
    // Add to topic history
    function addToTopicHistory(topic, message, timestamp) {
        if (!topicHistory.has(topic)) {
            topicHistory.set(topic, []);
        }
        
        const history = topicHistory.get(topic);
        history.unshift({ message, timestamp });
        
        // Limit history to MAX_HISTORY_ITEMS items
        if (history.length > MAX_HISTORY_ITEMS) {
            history.pop();
        }
        
        // Update history log
        updateHistoryLog(topic);
    }
    
    // Update history log for a topic
    function updateHistoryLog(topic) {
        let historyLog;
        
        if (topic.startsWith('system/time') || topic === 'system/date') {
            historyLog = timeHistoryLog;
        } else if (topic === 'system/uptime' || topic === 'system/memory' || topic === 'system/cpu/load') {
            historyLog = systemHistoryLog;
        } else if (topic === 'system/network') {
            historyLog = networkHistoryLog;
        } else if (dynamicTopicCards.has(topic)) {
            // Get history log for dynamic topic
            const card = dynamicTopicCards.get(topic);
            historyLog = card.querySelector('.topic-history-log');
        } else {
            // No log to update
            return;
        }
        
        if (!historyLog) return;
        
        // Get history for this topic
        const history = topicHistory.get(topic) || [];
        
        // Clear history log
        historyLog.innerHTML = '';
        
        if (history.length === 0) {
            historyLog.innerHTML = '<div class="text-center text-muted small">No history data</div>';
            return;
        }
        
        // Add history items
        history.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            
            let messageContent;
            if (typeof item.message === 'object') {
                try {
                    messageContent = JSON.stringify(item.message);
                    if (messageContent.length > 50) {
                        messageContent = messageContent.substring(0, 47) + '...';
                    }
                } catch (e) {
                    messageContent = 'Object';
                }
            } else {
                messageContent = String(item.message);
                if (messageContent.length > 50) {
                    messageContent = messageContent.substring(0, 47) + '...';
                }
            }
            
            historyItem.innerHTML = `
                ${messageContent}
                <span class="history-timestamp">${formatTime(item.timestamp)}</span>
            `;
            
            historyLog.appendChild(historyItem);
        });
    }
    
    // Handle dynamic topic creation and updates
    function handleDynamicTopic(topic, message, timestamp) {
        // Skip system topics and empty topics
        if (isSystemTopic(topic) || !topic || topic === '') {
            console.log('Skipping system or empty topic:', topic);
            return;
        }
        
        console.log('Handling dynamic topic:', topic);
        console.log('Message content:', typeof message === 'object' ? JSON.stringify(message) : message);
        console.log('Active topics before processing:', Array.from(topics.keys()));
        console.log('Dynamic topic cards before processing:', Array.from(dynamicTopicCards.keys()));
        
        // Parse string messages that should be JSON
        if (typeof message === 'string' && (message.startsWith('{') || message.startsWith('['))) {
            try {
                message = JSON.parse(message);
                console.log('Parsed message as JSON:', message);
            } catch (e) {
                console.warn('Failed to parse message as JSON:', e);
            }
        }
        
        // Create card if it doesn't exist
        if (!dynamicTopicCards.has(topic)) {
            console.log('Creating new dynamic card for topic:', topic);
            createDynamicTopicCard(topic, message);
        } else {
            console.log('Updating existing card for topic:', topic);
            // Update card content
            updateDynamicTopicCard(topic, message);
        }
    }
    
    // Create a dynamic topic card
    function createDynamicTopicCard(topic, message) {
        console.log('Creating dynamic card for topic:', topic);
        
        if (!dynamicTopicCardsContainer || !topicCardTemplate) {
            console.error('Cannot create card: Missing container or template. Container:', !!dynamicTopicCardsContainer, 'Template:', !!topicCardTemplate);
            return;
        }

        // Clone the template
        const template = document.getElementById('topic-card-template');
        if (!template) {
            console.error('Topic card template not found');
            return;
        }

        // Check if content can be cloned
        if (!template.content) {
            console.error('Template content is not available - template may not be properly defined');
            return;
        }

        const cardContent = template.content.cloneNode(true);
        const card = cardContent.querySelector('.dynamic-topic-card');
        
        if (!card) {
            console.error('Could not find dynamic-topic-card element in the template');
            return;
        }
        
        // Set card ID for future reference
        const cardId = `topic-card-${topic.replace(/[^a-zA-Z0-9]/g, '-')}`;
        card.id = cardId;
        
        // Set card title
        const topicTitle = card.querySelector('.topic-title');
        if (topicTitle) {
            topicTitle.textContent = getTopicTitle(topic);
        }
        
        // Set topic path in footer
        const topicPath = card.querySelector('.topic-path');
        if (topicPath) {
            topicPath.textContent = topic;
        }
        
        // Set card header color based on topic
        const cardHeader = card.querySelector('.card-header');
        if (cardHeader) {
            // Assign different colors based on topic type
            if (topic.includes('sensor')) {
                cardHeader.className = 'card-header bg-primary text-white';
            } else if (topic.includes('device')) {
                cardHeader.className = 'card-header bg-success text-white';
            } else if (topic.includes('light')) {
                cardHeader.className = 'card-header bg-warning text-dark';
            } else if (topic.includes('switch') || topic.includes('relay')) {
                cardHeader.className = 'card-header bg-danger text-white';
            } else if (topic.includes('status')) {
                cardHeader.className = 'card-header bg-info text-white';
            } else {
                cardHeader.className = 'card-header bg-secondary text-white';
            }
            
            // Set card icon based on topic
            const cardIcon = cardHeader.querySelector('i');
            if (cardIcon) {
                if (topic.includes('temperature')) {
                    cardIcon.className = 'fas fa-thermometer-half me-2';
                } else if (topic.includes('humidity')) {
                    cardIcon.className = 'fas fa-tint me-2';
                } else if (topic.includes('pressure')) {
                    cardIcon.className = 'fas fa-tachometer-alt me-2';
                } else if (topic.includes('light')) {
                    cardIcon.className = 'fas fa-lightbulb me-2';
                } else if (topic.includes('switch') || topic.includes('relay')) {
                    cardIcon.className = 'fas fa-power-off me-2';
                } else if (topic.includes('motion')) {
                    cardIcon.className = 'fas fa-running me-2';
                } else {
                    cardIcon.className = 'fas fa-cube me-2';
                }
            }
        }
        
        // Set up history collapse trigger
        const historyButton = card.querySelector('.history-button');
        const historyCollapse = card.querySelector('.history-collapse');
        
        if (historyButton && historyCollapse) {
            const collapseId = `history-collapse-${topic.replace(/[^a-zA-Z0-9]/g, '-')}`;
            historyCollapse.id = collapseId;
            historyButton.setAttribute('data-bs-target', `#${collapseId}`);
            historyButton.setAttribute('aria-expanded', 'false');
            historyButton.setAttribute('aria-controls', collapseId);
        }
        
        // Add the card to the DOM
        dynamicTopicCards.set(topic, card);
        dynamicTopicCardsContainer.appendChild(card);
        
        // Update the card content
        updateDynamicTopicCard(topic, message);
        
        console.log('Card created for topic:', topic);
    }
    
    // Update a dynamic topic card
    function updateDynamicTopicCard(topic, message) {
        const card = dynamicTopicCards.get(topic);
        if (!card) {
            console.error('Card not found for topic:', topic);
            return;
        }
        
        console.log('Updating card for topic:', topic, 'with message:', message);
        const contentEl = card.querySelector('.topic-content');
        
        // Format content based on message type and topic
        if (typeof message === 'object') {
            // For special topic types, create a more readable display
            if (topic.includes('temperature') && message.value !== undefined) {
                contentEl.innerHTML = `
                    <div class="text-center my-3">
                        <span class="display-4">${message.value}<small>${message.unit || '°C'}</small></span>
                        <div class="text-muted small mt-2">${message.status || ''}</div>
                    </div>
                `;
            } else if (topic.includes('humidity') && message.value !== undefined) {
                contentEl.innerHTML = `
                    <div class="text-center my-3">
                        <span class="display-4">${message.value}<small>${message.unit || '%'}</small></span>
                        <div class="text-muted small mt-2">${message.status || ''}</div>
                    </div>
                `;
            } else if (topic.includes('light') && message.state !== undefined) {
                const isOn = message.state === 'ON' || message.state === true;
                contentEl.innerHTML = `
                    <div class="text-center my-3">
                        <div class="mb-2"><i class="fas fa-lightbulb ${isOn ? 'text-warning' : 'text-muted'}" style="font-size: 3rem;"></i></div>
                        <div>${isOn ? 'ON' : 'OFF'}</div>
                        ${message.brightness !== undefined ? `<div class="text-muted small">Brightness: ${message.brightness}%</div>` : ''}
                    </div>
                `;
            } else if (topic.includes('switch') && message.state !== undefined) {
                const isOpen = message.state === 'OPEN' || message.state === true;
                contentEl.innerHTML = `
                    <div class="text-center my-3">
                        <div class="mb-2"><i class="fas ${isOpen ? 'fa-door-open text-danger' : 'fa-door-closed text-success'}" style="font-size: 3rem;"></i></div>
                        <div>${message.state}</div>
                    </div>
                `;
            } else if (topic.includes('battery') && message.level !== undefined) {
                let batteryIcon = 'fa-battery-empty';
                if (message.level > 75) batteryIcon = 'fa-battery-full';
                else if (message.level > 50) batteryIcon = 'fa-battery-three-quarters';
                else if (message.level > 25) batteryIcon = 'fa-battery-half';
                else if (message.level > 5) batteryIcon = 'fa-battery-quarter';
                
                contentEl.innerHTML = `
                    <div class="text-center my-3">
                        <div class="mb-2">
                            <i class="fas ${batteryIcon} ${message.level > 20 ? 'text-success' : 'text-danger'}" style="font-size: 3rem;"></i>
                            ${message.charging ? '<i class="fas fa-bolt text-warning ms-2"></i>' : ''}
                        </div>
                        <div>${message.level}%</div>
                    </div>
                `;
            } else {
                // Default object display
                contentEl.innerHTML = `<pre class="mb-0 small">${JSON.stringify(message, null, 2)}</pre>`;
            }
        } else if (typeof message === 'string' && message.startsWith('{') && message.endsWith('}')) {
            // Try to parse JSON
            try {
                const parsed = JSON.parse(message);
                contentEl.innerHTML = `<pre class="mb-0 small">${JSON.stringify(parsed, null, 2)}</pre>`;
            } catch (e) {
                contentEl.textContent = message;
            }
        } else {
            // Plain text message
            contentEl.textContent = message;
        }
    }
    
    // Get a friendly title from a topic
    function getTopicTitle(topic) {
        // Get the last part of the topic
        const parts = topic.split('/');
        let title = parts[parts.length - 1];
        
        // Capitalize first letter
        title = title.charAt(0).toUpperCase() + title.slice(1);
        
        // Replace underscores and hyphens with spaces
        title = title.replace(/[_-]/g, ' ');
        
        return title;
    }
    
    // Handle system topics and update cards
    function handleSystemTopic(topic, message) {
        console.log('Handling system topic:', topic, message);
        
        // Special handling for string messages that should be JSON
        if (typeof message === 'string' && (message.startsWith('{') || message.startsWith('['))) {
            try {
                message = JSON.parse(message);
                console.log('Successfully parsed JSON message:', message);
            } catch (e) {
                console.warn('Failed to parse JSON message:', e);
            }
        }
        
        switch (topic) {
            case 'system/time/iso':
                systemTimeIso.textContent = message;
                break;
            case 'system/time/readable':
                systemTimeReadable.textContent = message;
                break;
            case 'system/date':
                if (typeof message === 'object') {
                    systemDate.textContent = `${message.weekday}, ${message.day}/${message.month}/${message.year}`;
                } else if (typeof message === 'string') {
                    try {
                        const parsed = JSON.parse(message);
                        systemDate.textContent = `${parsed.weekday}, ${parsed.day}/${parsed.month}/${parsed.year}`;
                    } catch (e) {
                        systemDate.textContent = message;
                    }
                }
                break;
            case 'system/time/unix':
                systemTimeUnix.textContent = message;
                break;
            case 'system/uptime':
                try {
                    // Parse the uptime value (could be string or number)
                    const uptimeSeconds = parseInt(String(message), 10);
                    console.log('Parsed uptime value:', uptimeSeconds);
                    if (!isNaN(uptimeSeconds)) {
                        const formattedUptime = formatUptime(uptimeSeconds);
                        console.log('Formatted uptime:', formattedUptime);
                        
                        // Update the system info card uptime
                        if (systemUptime) {
                            systemUptime.textContent = formattedUptime;
                        } else {
                            console.error('System uptime element not found');
                        }
                        
                        // Also update the dashboard sidebar uptime display
                        if (uptimeElement) {
                            uptimeElement.textContent = formattedUptime;
                        } else {
                            console.error('Uptime element not found');
                        }
                    } else {
                        console.error('Invalid uptime value:', message);
                        systemUptime.textContent = 'Invalid';
                        if (uptimeElement) uptimeElement.textContent = 'Invalid';
                    }
                } catch (e) {
                    console.error('Error parsing uptime:', e);
                    systemUptime.textContent = 'Error';
                    if (uptimeElement) uptimeElement.textContent = 'Error';
                }
                break;
            case 'system/memory':
                if (typeof message === 'object') {
                    systemMemory.innerHTML = `
                        <div>${message.used} / ${message.total}</div>
                        <div class="progress mt-1" style="height: 5px;">
                            <div class="progress-bar" role="progressbar" style="width: ${message.percentUsed}%;" 
                                aria-valuenow="${message.percentUsed}" aria-valuemin="0" aria-valuemax="100"></div>
                        </div>
                    `;
                } else if (typeof message === 'string') {
                    try {
                        const parsed = JSON.parse(message);
                        systemMemory.innerHTML = `
                            <div>${parsed.used} / ${parsed.total}</div>
                            <div class="progress mt-1" style="height: 5px;">
                                <div class="progress-bar" role="progressbar" style="width: ${parsed.percentUsed}%;" 
                                    aria-valuenow="${parsed.percentUsed}" aria-valuemin="0" aria-valuemax="100"></div>
                            </div>
                        `;
                    } catch (e) {
                        systemMemory.textContent = message;
                    }
                }
                break;
            case 'system/cpu/load':
                if (typeof message === 'object') {
                    systemCpuLoad.innerHTML = `
                        <div>1min: ${message['1min'].toFixed(2)}</div>
                        <div>5min: ${message['5min'].toFixed(2)}</div>
                        <div>15min: ${message['15min'].toFixed(2)}</div>
                    `;
                } else if (typeof message === 'string') {
                    try {
                        const parsed = JSON.parse(message);
                        systemCpuLoad.innerHTML = `
                            <div>1min: ${parsed['1min'].toFixed(2)}</div>
                            <div>5min: ${parsed['5min'].toFixed(2)}</div>
                            <div>15min: ${parsed['15min'].toFixed(2)}</div>
                        `;
                    } catch (e) {
                        systemCpuLoad.textContent = message;
                    }
                }
                break;
            case 'system/network':
                if (typeof message === 'object') {
                    renderNetworkInfo(message);
                } else if (typeof message === 'string') {
                    try {
                        const parsed = JSON.parse(message);
                        renderNetworkInfo(parsed);
                    } catch (e) {
                        systemNetwork.textContent = message;
                    }
                }
                break;
        }
    }
    
    function renderNetworkInfo(data) {
        let html = '';
        Object.entries(data).forEach(([name, info]) => {
            html += `
                <div class="network-interface">
                    <div><i class="fas fa-network-wired me-2"></i><strong>${name}</strong></div>
                    <div class="ms-4"><small>IP: ${info.address}</small></div>
                    <div class="ms-4"><small>MAC: ${info.mac}</small></div>
                </div>
            `;
        });
        systemNetwork.innerHTML = html || '<div class="text-center text-muted">No network interfaces found</div>';
    }
}); 