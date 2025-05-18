document.addEventListener('DOMContentLoaded', () => {
    console.log('Topics management page initializing...');
    
    // Connect to Socket.IO server
    const socket = io();
    
    // DOM elements
    const statusBadge = document.getElementById('status-badge');
    const topicsTable = document.getElementById('topics-table');
    const topicsList = document.getElementById('topics-list');
    const createTopicBtn = document.getElementById('create-topic-btn');
    const topicModal = document.getElementById('topic-modal');
    const modalTitle = document.getElementById('modal-title');
    const topicForm = document.getElementById('topic-form');
    const topicPath = document.getElementById('topic-path');
    const saveTopicBtn = document.getElementById('save-topic-btn');
    const formatRadios = document.querySelectorAll('input[name="message-format"]');
    const textMessage = document.getElementById('text-message');
    const numberMessage = document.getElementById('number-message');
    const deleteModal = document.getElementById('delete-modal');
    const deleteTopicPath = document.getElementById('delete-topic-path');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const retainFlag = document.getElementById('retain-flag');
    const createAutomationBtn = document.getElementById('create-automation-btn');
    
    // Set up JSONEditor
    const container = document.getElementById('jsoneditor');
    const options = {
        mode: 'tree',
        modes: ['tree', 'code'],
        onError: function (err) {
            alert(err.toString());
        }
    };
    const jsonEditor = new JSONEditor(container, options);
    
    // Initialize with empty object
    jsonEditor.set({});
    
    // Initialize DataTable
    let dataTable = $(topicsTable).DataTable({
        order: [[0, 'asc']],
        pageLength: 25,
        columns: [
            { data: 'topic' },
            { data: 'type' },
            { data: 'value' },
            { data: 'retained' },
            { data: 'lastUpdate' },
            { data: 'actions' }
        ]
    });
    
    // Application state
    let isConnected = false;
    let topics = new Map();
    let currentAction = 'create'; // 'create' or 'edit'
    let currentTopic = '';
    
    // Explicitly subscribe to all topics once connected
    function subscribeToAllTopics() {
        console.log('Subscribing to all topics...');
        socket.emit('subscribe', { topic: '#' });
    }
    
    // Socket.IO event handlers
    socket.on('connect', () => {
        console.log('Connected to server');
        setConnectionStatus('connected');
        isConnected = true;
        
        // Subscribe to all topics
        subscribeToAllTopics();
        
        // Load initial topics
        fetchTopics();
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        setConnectionStatus('disconnected');
        isConnected = false;
    });
    
    // Handle incoming MQTT messages
    socket.on('mqtt_message', (data) => {
        console.log('Received message:', data.topic, data.message);
        
        // Ensure message is properly formatted
        let parsedMessage = data.message;
        if (typeof data.message === 'string' && (data.message.startsWith('{') || data.message.startsWith('['))) {
            try {
                parsedMessage = JSON.parse(data.message);
            } catch (e) {
                parsedMessage = data.message;
            }
        }
        
        // Update topics map
        if (!topics.has(data.topic)) {
            topics.set(data.topic, {
                message: parsedMessage,
                time: data.time,
                retained: true // Assume retained for now
            });
        } else {
            const topicData = topics.get(data.topic);
            topicData.message = parsedMessage;
            topicData.time = data.time;
        }
        
        // Update the table
        updateTopicsTable();
    });
    
    // Handle publish success/error
    socket.on('publish_success', (data) => {
        showToast('Message published successfully', 'success');
    });
    
    socket.on('publish_error', (data) => {
        showToast(`Failed to publish: ${data.error}`, 'danger');
    });
    
    // Event listeners
    createTopicBtn.addEventListener('click', () => {
        openTopicModal('create');
    });
    
    saveTopicBtn.addEventListener('click', () => {
        saveTopic();
    });
    
    confirmDeleteBtn.addEventListener('click', () => {
        deleteTopic(currentTopic);
    });
    
    // Create automation rule button listener
    if (createAutomationBtn) {
        createAutomationBtn.addEventListener('click', () => {
            createAutomationForTopic(currentTopic);
        });
    }
    
    // Switch between message format fields
    formatRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            const format = radio.value;
            showMessageField(format);
        });
    });
    
    // Helper functions
    function setConnectionStatus(status) {
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
    
    function fetchTopics() {
        fetch('/api/topics')
            .then(response => response.json())
            .then(data => {
                // Clear existing topics
                topics.clear();
                
                // Add fetched topics
                data.forEach(topic => {
                    topics.set(topic.topic, {
                        message: topic.lastMessage,
                        time: topic.lastUpdate,
                        retained: true // Assume retained for fetched topics
                    });
                });
                
                // Update the table
                updateTopicsTable();
            })
            .catch(error => {
                console.error('Error fetching topics:', error);
                showToast('Failed to load topics', 'danger');
            });
    }
    
    function updateTopicsTable() {
        // Clear the table
        dataTable.clear();
        
        // Add topics to the table
        Array.from(topics.entries()).forEach(([topic, data]) => {
            const valueType = getValueType(data.message);
            const valuePreview = getValuePreview(data.message, valueType);
            const formattedTime = formatTime(data.time);
            
            dataTable.row.add({
                topic: `<span class="topic-path">${topic}</span>`,
                type: `<span class="badge bg-secondary">${valueType}</span>`,
                value: `<div class="value-preview">${valuePreview}</div>`,
                retained: `<span class="badge ${data.retained ? 'bg-success' : 'bg-secondary'}">${data.retained ? 'Yes' : 'No'}</span>`,
                lastUpdate: formattedTime,
                actions: `
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-primary edit-btn" data-topic="${topic}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger delete-btn" data-topic="${topic}">
                            <i class="fas fa-trash"></i>
                        </button>
                        <button class="btn btn-sm btn-info view-btn" data-topic="${topic}">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                `
            });
        });
        
        // Redraw the table
        dataTable.draw();
        
        // Add event listeners to buttons
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const topic = btn.getAttribute('data-topic');
                openTopicModal('edit', topic);
            });
        });
        
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const topic = btn.getAttribute('data-topic');
                openDeleteModal(topic);
            });
        });
        
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const topic = btn.getAttribute('data-topic');
                viewTopicDetails(topic);
            });
        });
    }
    
    function getValueType(value) {
        if (value === null || value === undefined) {
            return 'null';
        }
        
        const type = typeof value;
        if (type === 'object') {
            if (Array.isArray(value)) {
                return 'array';
            }
            return 'object';
        }
        
        return type;
    }
    
    function getValuePreview(value, type) {
        if (value === null || value === undefined) {
            return '<em class="text-muted">null</em>';
        }
        
        switch (type) {
            case 'object':
            case 'array':
                return `<code>${JSON.stringify(value).substring(0, 100)}${JSON.stringify(value).length > 100 ? '...' : ''}</code>`;
            case 'string':
                return value.length > 100 ? `${value.substring(0, 100)}...` : value;
            case 'boolean':
                return value ? 
                    '<span class="badge bg-success">true</span>' : 
                    '<span class="badge bg-danger">false</span>';
            default:
                return String(value);
        }
    }
    
    function formatTime(timeString) {
        try {
            const date = new Date(timeString);
            return date.toLocaleString();
        } catch (e) {
            return timeString || 'Unknown';
        }
    }
    
    function openTopicModal(action, topic = '') {
        currentAction = action;
        currentTopic = topic;
        
        if (action === 'create') {
            modalTitle.textContent = 'Create Topic';
            topicPath.value = '';
            topicPath.disabled = false;
            resetMessageFields();
        } else {
            modalTitle.textContent = 'Edit Topic';
            topicPath.value = topic;
            topicPath.disabled = true; // Can't edit topic path, only the value
            
            // Load current value
            const topicData = topics.get(topic);
            if (topicData) {
                const messageValue = topicData.message;
                const valueType = getValueType(messageValue);
                
                // Set appropriate format radio
                document.getElementById(`format-${valueType === 'array' ? 'json' : valueType}`).checked = true;
                
                // Show appropriate field
                showMessageField(valueType === 'array' ? 'json' : valueType);
                
                // Set the value
                setMessageValue(messageValue, valueType);
                
                // Set retain flag
                retainFlag.checked = topicData.retained;
            }
        }
        
        // Show the modal
        const modal = new bootstrap.Modal(topicModal);
        modal.show();
    }
    
    function resetMessageFields() {
        // Reset all inputs
        textMessage.value = '';
        numberMessage.value = '';
        jsonEditor.set({});
        document.getElementById('boolean-true').checked = true;
        
        // Set format to text by default
        document.getElementById('format-text').checked = true;
        showMessageField('text');
        
        // Retain flag is checked by default
        retainFlag.checked = true;
    }
    
    function showMessageField(format) {
        // Hide all fields
        document.querySelectorAll('.message-field').forEach(field => {
            field.classList.add('d-none');
        });
        
        // Show selected field
        const fieldToShow = document.getElementById(`${format}-field`);
        if (fieldToShow) {
            fieldToShow.classList.remove('d-none');
        }
    }
    
    function setMessageValue(value, type) {
        switch (type) {
            case 'string':
                textMessage.value = value;
                break;
            case 'number':
                numberMessage.value = value;
                break;
            case 'boolean':
                document.getElementById(`boolean-${value}`).checked = true;
                break;
            case 'object':
            case 'array':
                jsonEditor.set(value);
                break;
        }
    }
    
    function getMessageValue() {
        const format = document.querySelector('input[name="message-format"]:checked').value;
        
        switch (format) {
            case 'text':
                return textMessage.value;
            case 'number':
                return parseFloat(numberMessage.value);
            case 'boolean':
                return document.querySelector('input[name="boolean-value"]:checked').value === 'true';
            case 'json':
                try {
                    return jsonEditor.get();
                } catch (e) {
                    showToast('Invalid JSON: ' + e.message, 'danger');
                    throw e;
                }
        }
    }
    
    function saveTopic() {
        const topic = topicPath.value.trim();
        
        if (!topic) {
            showToast('Topic path is required', 'danger');
            return;
        }
        
        try {
            const message = getMessageValue();
            const retain = retainFlag.checked;
            
            // Send to server
            publishTopic(topic, message, retain);
            
            // Close the modal
            bootstrap.Modal.getInstance(topicModal).hide();
        } catch (e) {
            console.error('Error saving topic:', e);
        }
    }
    
    function publishTopic(topic, message, retain) {
        const url = `/api/topics/${encodeURIComponent(topic)}`;
        
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message,
                retain
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                showToast(`Topic ${currentAction === 'create' ? 'created' : 'updated'} successfully`, 'success');
                
                // Add to local topics map
                topics.set(topic, {
                    message,
                    time: new Date().toISOString(),
                    retained: retain
                });
                
                // Update table
                updateTopicsTable();
            } else {
                showToast(`Failed to ${currentAction} topic: ${data.error || 'Unknown error'}`, 'danger');
            }
        })
        .catch(error => {
            console.error(`Error ${currentAction}ing topic:`, error);
            showToast(`Failed to ${currentAction} topic: ${error.message}`, 'danger');
        });
    }
    
    function openDeleteModal(topic) {
        currentTopic = topic;
        deleteTopicPath.textContent = topic;
        
        const modal = new bootstrap.Modal(deleteModal);
        modal.show();
    }
    
    function deleteTopic(topic) {
        const url = `/api/topics/${encodeURIComponent(topic)}`;
        
        fetch(url, {
            method: 'DELETE'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                showToast('Topic deleted successfully', 'success');
                
                // Remove from local topics map
                topics.delete(topic);
                
                // Update table
                updateTopicsTable();
                
                // Close the modal
                bootstrap.Modal.getInstance(deleteModal).hide();
            } else {
                showToast(`Failed to delete topic: ${data.error || 'Unknown error'}`, 'danger');
            }
        })
        .catch(error => {
            console.error('Error deleting topic:', error);
            showToast(`Failed to delete topic: ${error.message}`, 'danger');
        });
    }
    
    function viewTopicDetails(topic) {
        const topicData = topics.get(topic);
        if (!topicData) {
            showToast('Topic data not found', 'danger');
            return;
        }
        
        const message = topicData.message;
        const valueType = getValueType(message);
        
        // Create a formatted message preview
        let preview;
        try {
            if (valueType === 'object' || valueType === 'array') {
                preview = JSON.stringify(message, null, 2);
            } else {
                preview = String(message);
            }
        } catch (e) {
            preview = 'Error formatting message: ' + e.message;
        }
        
        const html = `
            <div class="modal fade" id="view-modal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Topic Details: ${topic}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Topic Path</label>
                                <input type="text" class="form-control" value="${topic}" readonly>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Type</label>
                                <input type="text" class="form-control" value="${valueType}" readonly>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Retained</label>
                                <input type="text" class="form-control" value="${topicData.retained ? 'Yes' : 'No'}" readonly>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Last Update</label>
                                <input type="text" class="form-control" value="${formatTime(topicData.time)}" readonly>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Value</label>
                                <pre class="form-control" style="height: 200px; overflow: auto;">${preview}</pre>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Create and append the modal
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        document.body.appendChild(tempDiv.firstElementChild);
        
        // Show the modal
        const viewModal = document.getElementById('view-modal');
        const modal = new bootstrap.Modal(viewModal);
        modal.show();
        
        // Clean up after hiding
        viewModal.addEventListener('hidden.bs.modal', () => {
            viewModal.remove();
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
    
    // Function to redirect to automation page with pre-filled topic
    function createAutomationForTopic(topic) {
        // Close current modal first
        const deleteModalInstance = bootstrap.Modal.getInstance(deleteModal);
        if (deleteModalInstance) {
            deleteModalInstance.hide();
        }
        
        // Redirect to automation page with topic parameter
        window.location.href = `/automation?create=true&topic=${encodeURIComponent(topic)}`;
    }
}); 