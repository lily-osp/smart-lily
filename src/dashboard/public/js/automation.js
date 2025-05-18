document.addEventListener('DOMContentLoaded', () => {
    console.log('Automation page initializing...');
    
    // Connect to Socket.IO server
    const socket = io();
    
    // DOM elements
    const statusBadge = document.getElementById('status-badge');
    const rulesContainer = document.getElementById('rules-container');
    const noRulesMessage = document.getElementById('no-rules-message');
    const createRuleBtn = document.getElementById('create-rule-btn');
    const createFirstRuleBtn = document.getElementById('create-first-rule-btn');
    const ruleModal = document.getElementById('rule-modal');
    const conditionModal = document.getElementById('condition-modal');
    const actionModal = document.getElementById('action-modal');
    const deleteModal = document.getElementById('delete-modal');
    const modalTitle = document.getElementById('modal-title');
    const ruleForm = document.getElementById('rule-form');
    const ruleName = document.getElementById('rule-name');
    const ruleDescription = document.getElementById('rule-description');
    const ruleEnabled = document.getElementById('rule-enabled');
    const conditionsContainer = document.getElementById('conditions-container');
    const actionsContainer = document.getElementById('actions-container');
    const addConditionBtn = document.getElementById('add-condition-btn');
    const addActionBtn = document.getElementById('add-action-btn');
    const saveRuleBtn = document.getElementById('save-rule-btn');
    const saveConditionBtn = document.getElementById('save-condition-btn');
    const saveActionBtn = document.getElementById('save-action-btn');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const deleteRuleName = document.getElementById('delete-rule-name');
    const automationHistory = document.getElementById('automation-history');
    const noHistoryMessage = document.getElementById('no-history-message');
    const quickLinksContainer = document.getElementById('quick-links-container');
    const noQuickLinksMessage = document.getElementById('no-quick-links-message');
    
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
    
    // Application state
    let isConnected = false;
    let rules = [];
    let topics = [];
    let currentAction = 'create'; // 'create' or 'edit'
    let currentRuleId = '';
    let currentConditionIndex = -1;
    let currentActionIndex = -1;
    let history = [];
    
    // Check for rule ID in URL parameters when page loads
    function checkForRuleInUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const ruleId = urlParams.get('rule');
        const createParam = urlParams.get('create');
        const topicParam = urlParams.get('topic');
        
        if (ruleId) {
            // Find the rule and open it
            fetch(`/api/automation/rules/${ruleId}`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Rule not found');
                    }
                    return response.json();
                })
                .then(rule => {
                    // Wait a moment for rules to load
                    setTimeout(() => {
                        openRuleModal('edit', ruleId);
                    }, 500);
                })
                .catch(error => {
                    showToast(`Quick link error: ${error.message}`, 'danger');
                });
        } else if (createParam === 'true') {
            // Open the create rule modal
            setTimeout(() => {
                openRuleModal('create');
                
                // If topic is provided, create a condition with it after modal is open
                if (topicParam) {
                    setTimeout(() => {
                        // Add a condition using the topic (wait a bit more to ensure modal is fully loaded)
                        prefillConditionWithTopic(topicParam);
                    }, 300);
                }
            }, 500);
        }
    }
    
    // Pre-fill condition with the specified topic
    function prefillConditionWithTopic(topic) {
        // Open condition modal
        openConditionModal();
        
        // Fill in the topic field
        setTimeout(() => {
            const topicField = document.getElementById('condition-topic');
            if (topicField) {
                // Check if the topic exists in the dropdown, otherwise add it
                let topicExists = false;
                Array.from(topicField.options).forEach(option => {
                    if (option.value === topic) {
                        topicExists = true;
                    }
                });
                
                if (!topicExists && topic) {
                    const option = document.createElement('option');
                    option.value = topic;
                    option.textContent = topic;
                    topicField.appendChild(option);
                }
                
                topicField.value = topic;
            }
        }, 100);
    }
    
    // Example rules for quick creation
    const exampleRules = {
        'temperature-fan': {
            name: 'Temperature Control',
            description: 'Turn on a fan when temperature exceeds 25°C',
            conditions: [
                {
                    id: crypto.randomUUID(),
                    topic: 'sensor/temperature',
                    operator: 'greaterThan',
                    value: 25
                }
            ],
            actions: [
                {
                    id: crypto.randomUUID(),
                    type: 'publishMessage',
                    params: {
                        topic: 'device/fan',
                        message: 'on',
                        retain: true
                    }
                }
            ],
            logicOperator: 'AND'
        },
        'motion-light': {
            name: 'Motion-Activated Light',
            description: 'Turn on lights when motion is detected',
            conditions: [
                {
                    id: crypto.randomUUID(),
                    topic: 'sensor/motion',
                    operator: 'equals',
                    value: 'detected'
                }
            ],
            actions: [
                {
                    id: crypto.randomUUID(),
                    type: 'publishMessage',
                    params: {
                        topic: 'device/light',
                        message: 'on',
                        retain: false
                    }
                }
            ],
            logicOperator: 'AND'
        },
        'door-alert': {
            name: 'Door Alert',
            description: 'Send a notification when the door opens',
            conditions: [
                {
                    id: crypto.randomUUID(),
                    topic: 'sensor/door',
                    operator: 'equals',
                    value: 'open'
                }
            ],
            actions: [
                {
                    id: crypto.randomUUID(),
                    type: 'sendNotification',
                    params: {
                        message: 'Door has been opened!'
                    }
                }
            ],
            logicOperator: 'AND'
        },
        'time-light': {
            name: 'Scheduled Lighting',
            description: 'Turn lights on at 18:00 and off at 6:00',
            conditions: [
                {
                    id: crypto.randomUUID(),
                    topic: 'system/time/hour',
                    operator: 'equals',
                    value: 18
                }
            ],
            actions: [
                {
                    id: crypto.randomUUID(),
                    type: 'publishMessage',
                    params: {
                        topic: 'device/light',
                        message: 'on',
                        retain: true
                    }
                }
            ],
            logicOperator: 'AND'
        }
    };
    
    // Socket.IO event handlers
    socket.on('connect', () => {
        console.log('Connected to server');
        setConnectionStatus('connected');
        isConnected = true;
        
        // Load rules
        loadRules();
        
        // Load available topics
        loadTopics();
        
        // Render quick links
        renderQuickLinks();

        // Check for rule ID in URL
        checkForRuleInUrl();
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        setConnectionStatus('disconnected');
        isConnected = false;
    });
    
    // Listen for automated rule events from server
    socket.on('automation-rule-added', (rule) => {
        addRuleToHistory(`Rule "${rule.name}" was created`);
        // Reload rules if we didn't create this rule ourselves
        if (!rules.some(r => r.id === rule.id)) {
            loadRules();
        }
    });
    
    socket.on('automation-rule-updated', (rule) => {
        addRuleToHistory(`Rule "${rule.name}" was updated`);
        // Reload rules if we didn't update this rule ourselves
        if (!rules.some(r => r.id === rule.id)) {
            loadRules();
        }
    });
    
    socket.on('automation-rule-deleted', (data) => {
        addRuleToHistory(`Rule was deleted (ID: ${data.id})`);
        // Reload rules if we didn't delete this rule ourselves
        if (rules.some(r => r.id === data.id)) {
            loadRules();
        }
    });
    
    socket.on('automation-rule-triggered', (rule) => {
        addRuleToHistory(`Rule "${rule.name}" was triggered`);
        
        // Update the UI to show when rule was last triggered
        const ruleCard = document.querySelector(`.rule-card[data-rule-id="${rule.id}"]`);
        if (ruleCard) {
            const lastTriggeredEl = ruleCard.querySelector('.rule-last-triggered');
            if (lastTriggeredEl) {
                lastTriggeredEl.textContent = `Last triggered: ${formatDateTime(rule.lastTriggered)}`;
            }
        }
    });
    
    socket.on('mqtt_message', (data) => {
        // We can use this to track topic values and show in the UI if needed
        if (!topics.includes(data.topic)) {
            topics.push(data.topic);
            updateTopicDropdowns();
        }
    });
    
    // Event listeners
    createRuleBtn.addEventListener('click', () => {
        openRuleModal('create');
    });
    
    createFirstRuleBtn.addEventListener('click', () => {
        openRuleModal('create');
    });
    
    saveRuleBtn.addEventListener('click', () => {
        saveRule();
    });
    
    addConditionBtn.addEventListener('click', () => {
        openConditionModal();
    });
    
    addActionBtn.addEventListener('click', () => {
        openActionModal();
    });
    
    saveConditionBtn.addEventListener('click', () => {
        saveCondition();
    });
    
    saveActionBtn.addEventListener('click', () => {
        saveAction();
    });
    
    confirmDeleteBtn.addEventListener('click', () => {
        deleteRule(currentRuleId);
    });
    
    // Example rule templates
    document.querySelectorAll('.example-rule').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            const exampleType = el.getAttribute('data-example');
            if (exampleRules[exampleType]) {
                createExampleRule(exampleRules[exampleType]);
            }
        });
    });
    
    // Handle dynamic form field toggles in the action modal
    document.getElementById('action-type').addEventListener('change', (e) => {
        const actionType = e.target.value;
        showActionFields(actionType);
    });
    
    document.getElementById('action-message-format').addEventListener('change', (e) => {
        const format = e.target.value;
        showMessageFormatFields(format);
    });
    
    // Hide value input for "changes" operator
    document.getElementById('condition-operator').addEventListener('change', (e) => {
        const operator = e.target.value;
        const valueContainer = document.getElementById('condition-value-container');
        if (operator === 'changes') {
            valueContainer.classList.add('d-none');
        } else {
            valueContainer.classList.remove('d-none');
        }
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
    
    function loadRules() {
        fetch('/api/automation/rules')
            .then(response => response.json())
            .then(data => {
                rules = data;
                renderRules();
            })
            .catch(error => {
                console.error('Error loading rules:', error);
                showToast('Failed to load automation rules', 'danger');
            });
    }
    
    function loadTopics() {
        fetch('/api/topics')
            .then(response => response.json())
            .then(data => {
                topics = data.map(t => t.topic);
                updateTopicDropdowns();
            })
            .catch(error => {
                console.error('Error loading topics:', error);
            });
    }
    
    function updateTopicDropdowns() {
        const topicSelects = document.querySelectorAll('#condition-topic, #action-topic');
        topicSelects.forEach(select => {
            // Keep the first option
            const firstOption = select.options[0];
            select.innerHTML = '';
            select.appendChild(firstOption);
            
            // Add sorted topics
            topics.sort().forEach(topic => {
                const option = document.createElement('option');
                option.value = topic;
                option.textContent = topic;
                select.appendChild(option);
            });
        });
    }
    
    function renderRules() {
        // Clear existing rules
        rulesContainer.innerHTML = '';
        
        // Show/hide no rules message
        if (rules.length === 0) {
            noRulesMessage.classList.remove('d-none');
        } else {
            noRulesMessage.classList.add('d-none');
            
            // Create a card for each rule
            rules.forEach(rule => {
                const ruleCard = createRuleCard(rule);
                rulesContainer.appendChild(ruleCard);
            });
            
            // Add event listeners to rule cards
            setupRuleCardListeners();
        }
    }
    
    function createRuleCard(rule) {
        // Clone the rule card template
        const template = document.getElementById('rule-card-template');
        const ruleCard = template.content.cloneNode(true).firstElementChild;
        
        // Set rule data attributes
        ruleCard.querySelector('.card').setAttribute('data-rule-id', rule.id);
        ruleCard.querySelector('.card').classList.add(rule.enabled ? 'enabled' : 'disabled');
        
        // Set rule name and toggle
        ruleCard.querySelector('.rule-name').textContent = rule.name;
        const toggle = ruleCard.querySelector('.rule-enabled-toggle');
        toggle.checked = rule.enabled;
        toggle.setAttribute('data-rule-id', rule.id);
        
        // Set rule description if available
        if (rule.description) {
            ruleCard.querySelector('.rule-description').textContent = rule.description;
        }
        
        // Set created date
        if (rule.createdAt) {
            ruleCard.querySelector('.rule-created-at').textContent = `Created: ${formatDateTime(rule.createdAt)}`;
        }
        
        // Set last triggered date if available
        if (rule.lastTriggered) {
            ruleCard.querySelector('.rule-last-triggered').textContent = `Last triggered: ${formatDateTime(rule.lastTriggered)}`;
        }
        
        // Set logic operator
        if (rule.logicOperator === 'AND') {
            ruleCard.querySelector('.logic-and').checked = true;
        } else {
            ruleCard.querySelector('.logic-or').checked = true;
        }
        
        // Add conditions
        const conditionsContainer = ruleCard.querySelector('.conditions-container');
        rule.conditions.forEach(condition => {
            const conditionElement = createConditionElement(condition);
            conditionsContainer.appendChild(conditionElement);
        });
        
        // Add actions
        const actionsContainer = ruleCard.querySelector('.actions-container');
        rule.actions.forEach(action => {
            const actionElement = createActionElement(action);
            actionsContainer.appendChild(actionElement);
        });
        
        // Add data attributes to buttons
        ruleCard.querySelector('.rule-edit-btn').setAttribute('data-rule-id', rule.id);
        ruleCard.querySelector('.rule-delete-btn').setAttribute('data-rule-id', rule.id);
        ruleCard.querySelector('.rule-quick-link-btn').setAttribute('data-rule-id', rule.id);
        
        return ruleCard;
    }
    
    function setupRuleCardListeners() {
        // Enable/disable toggle
        document.querySelectorAll('.rule-enabled-toggle').forEach(toggle => {
            toggle.addEventListener('change', () => {
                const ruleId = toggle.getAttribute('data-rule-id');
                const enabled = toggle.checked;
                toggleRuleEnabled(ruleId, enabled);
            });
        });
        
        // Edit button
        document.querySelectorAll('.rule-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const ruleId = btn.getAttribute('data-rule-id');
                openRuleModal('edit', ruleId);
            });
        });
        
        // Delete button
        document.querySelectorAll('.rule-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const ruleId = btn.getAttribute('data-rule-id');
                const ruleName = rules.find(r => r.id === ruleId)?.name || 'Unknown';
                openDeleteModal(ruleId, ruleName);
            });
        });

        // Quick Link button
        document.querySelectorAll('.rule-quick-link-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const ruleId = btn.getAttribute('data-rule-id');
                createQuickLink(ruleId);
            });
        });
    }
    
    function createConditionElement(condition) {
        const div = document.createElement('div');
        div.className = 'condition-item';
        div.setAttribute('data-condition-id', condition.id);
        
        // Format the operator for display
        let operatorText = condition.operator;
        switch (condition.operator) {
            case 'equals':
                operatorText = '==';
                break;
            case 'notEquals':
                operatorText = '!=';
                break;
            case 'greaterThan':
                operatorText = '>';
                break;
            case 'lessThan':
                operatorText = '<';
                break;
            case 'contains':
                operatorText = 'contains';
                break;
            case 'doesNotContain':
                operatorText = 'not contains';
                break;
            case 'changes':
                operatorText = 'changes';
                break;
        }
        
        let valueDisplay = condition.operator === 'changes' ? 
            '<span class="badge bg-secondary">any value</span>' : 
            `<code>${JSON.stringify(condition.value)}</code>`;
        
        div.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <span class="badge bg-primary topic-badge" title="${condition.topic}">${condition.topic}</span>
                    <span class="badge bg-secondary operator-badge">${operatorText}</span>
                    <span class="value-display">${valueDisplay}</span>
                </div>
            </div>
        `;
        
        return div;
    }
    
    function createActionElement(action) {
        const div = document.createElement('div');
        div.className = 'action-item';
        div.setAttribute('data-action-id', action.id);
        
        let actionContent = '';
        
        switch (action.type) {
            case 'publishMessage':
                const message = typeof action.params.message === 'object' ? 
                    JSON.stringify(action.params.message) : action.params.message;
                    
                actionContent = `
                    <div>
                        <span class="badge bg-success">Publish</span>
                        <span class="badge bg-primary topic-badge" title="${action.params.topic}">${action.params.topic}</span>
                        <span class="value-display"><code>${message}</code></span>
                        ${action.params.retain ? '<span class="badge bg-warning">retain</span>' : ''}
                    </div>
                `;
                break;
                
            case 'sendNotification':
                actionContent = `
                    <div>
                        <span class="badge bg-info">Notify</span>
                        <span class="value-display">${action.params.message}</span>
                    </div>
                `;
                break;
                
            case 'executeCommand':
                actionContent = `
                    <div>
                        <span class="badge bg-warning">Execute</span>
                        <span class="value-display"><code>${action.params.command}</code></span>
                    </div>
                `;
                break;
        }
        
        div.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                ${actionContent}
            </div>
        `;
        
        return div;
    }
    
    function openRuleModal(action, ruleId = '') {
        currentAction = action;
        currentRuleId = ruleId;
        
        // Reset form
        ruleName.value = '';
        ruleDescription.value = '';
        ruleEnabled.checked = true;
        conditionsContainer.innerHTML = '';
        actionsContainer.innerHTML = '';
        document.getElementById('and-operator').checked = true;
        
        if (action === 'create') {
            modalTitle.textContent = 'Create Automation Rule';
        } else {
            modalTitle.textContent = 'Edit Automation Rule';
            
            // Load rule data
            const rule = rules.find(r => r.id === ruleId);
            if (rule) {
                ruleName.value = rule.name;
                ruleDescription.value = rule.description || '';
                ruleEnabled.checked = rule.enabled;
                
                // Set logic operator
                if (rule.logicOperator === 'AND') {
                    document.getElementById('and-operator').checked = true;
                } else {
                    document.getElementById('or-operator').checked = true;
                }
                
                // Add conditions
                rule.conditions.forEach(condition => {
                    const conditionElement = createEditableConditionElement(condition);
                    conditionsContainer.appendChild(conditionElement);
                });
                
                // Add actions
                rule.actions.forEach(action => {
                    const actionElement = createEditableActionElement(action);
                    actionsContainer.appendChild(actionElement);
                });
            }
        }
        
        // Show the modal
        const modal = new bootstrap.Modal(ruleModal);
        modal.show();
    }
    
    function createEditableConditionElement(condition) {
        const div = document.createElement('div');
        div.className = 'condition-item';
        div.setAttribute('data-condition-id', condition.id);
        
        // Format the operator for display
        let operatorText = condition.operator;
        switch (condition.operator) {
            case 'equals':
                operatorText = '==';
                break;
            case 'notEquals':
                operatorText = '!=';
                break;
            case 'greaterThan':
                operatorText = '>';
                break;
            case 'lessThan':
                operatorText = '<';
                break;
            case 'contains':
                operatorText = 'contains';
                break;
            case 'doesNotContain':
                operatorText = 'not contains';
                break;
            case 'changes':
                operatorText = 'changes';
                break;
        }
        
        let valueDisplay = condition.operator === 'changes' ? 
            '<span class="badge bg-secondary">any value</span>' : 
            `<code>${JSON.stringify(condition.value)}</code>`;
        
        div.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <span class="badge bg-primary topic-badge" title="${condition.topic}">${condition.topic}</span>
                    <span class="badge bg-secondary operator-badge">${operatorText}</span>
                    <span class="value-display">${valueDisplay}</span>
                </div>
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-primary edit-condition-btn">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger remove-condition-btn">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Add event listeners
        div.querySelector('.edit-condition-btn').addEventListener('click', () => {
            openConditionModal(condition);
        });
        
        div.querySelector('.remove-condition-btn').addEventListener('click', () => {
            div.remove();
        });
        
        return div;
    }
    
    function createEditableActionElement(action) {
        const div = document.createElement('div');
        div.className = 'action-item';
        div.setAttribute('data-action-id', action.id);
        
        let actionContent = '';
        
        switch (action.type) {
            case 'publishMessage':
                const message = typeof action.params.message === 'object' ? 
                    JSON.stringify(action.params.message) : action.params.message;
                    
                actionContent = `
                    <div>
                        <span class="badge bg-success">Publish</span>
                        <span class="badge bg-primary topic-badge" title="${action.params.topic}">${action.params.topic}</span>
                        <span class="value-display"><code>${message}</code></span>
                        ${action.params.retain ? '<span class="badge bg-warning">retain</span>' : ''}
                    </div>
                `;
                break;
                
            case 'sendNotification':
                actionContent = `
                    <div>
                        <span class="badge bg-info">Notify</span>
                        <span class="value-display">${action.params.message}</span>
                    </div>
                `;
                break;
                
            case 'executeCommand':
                actionContent = `
                    <div>
                        <span class="badge bg-warning">Execute</span>
                        <span class="value-display"><code>${action.params.command}</code></span>
                    </div>
                `;
                break;
        }
        
        div.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                ${actionContent}
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-primary edit-action-btn">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger remove-action-btn">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Add event listeners
        div.querySelector('.edit-action-btn').addEventListener('click', () => {
            openActionModal(action);
        });
        
        div.querySelector('.remove-action-btn').addEventListener('click', () => {
            div.remove();
        });
        
        return div;
    }
    
    function saveRule() {
        // Validate form
        if (!ruleName.value) {
            showToast('Rule name is required', 'danger');
            return;
        }
        
        // Get conditions
        const conditionElements = conditionsContainer.querySelectorAll('.condition-item');
        if (conditionElements.length === 0) {
            showToast('At least one condition is required', 'danger');
            return;
        }
        
        // Get actions
        const actionElements = actionsContainer.querySelectorAll('.action-item');
        if (actionElements.length === 0) {
            showToast('At least one action is required', 'danger');
            return;
        }
        
        // Collect conditions
        const conditions = [];
        conditionElements.forEach(el => {
            const conditionId = el.getAttribute('data-condition-id');
            // Find condition in the current rule or create a new one
            let condition = null;
            if (currentAction === 'edit') {
                const rule = rules.find(r => r.id === currentRuleId);
                if (rule) {
                    condition = rule.conditions.find(c => c.id === conditionId);
                }
            }
            
            if (condition) {
                conditions.push(condition);
            }
        });
        
        // Collect actions
        const actions = [];
        actionElements.forEach(el => {
            const actionId = el.getAttribute('data-action-id');
            // Find action in the current rule or create a new one
            let action = null;
            if (currentAction === 'edit') {
                const rule = rules.find(r => r.id === currentRuleId);
                if (rule) {
                    action = rule.actions.find(a => a.id === actionId);
                }
            }
            
            if (action) {
                actions.push(action);
            }
        });
        
        // Determine logic operator
        const logicOperator = document.getElementById('and-operator').checked ? 'AND' : 'OR';
        
        // Create rule object
        const rule = {
            name: ruleName.value,
            description: ruleDescription.value,
            enabled: ruleEnabled.checked,
            conditions,
            actions,
            logicOperator
        };
        
        // If editing, add the ID
        if (currentAction === 'edit') {
            rule.id = currentRuleId;
        }
        
        // Send to server
        const url = currentAction === 'create' ? 
            '/api/automation/rules' : 
            `/api/automation/rules/${currentRuleId}`;
            
        const method = currentAction === 'create' ? 'POST' : 'PUT';
        
        fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(rule)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // Close the modal
            bootstrap.Modal.getInstance(ruleModal).hide();
            
            // Show success message
            showToast(`Rule ${currentAction === 'create' ? 'created' : 'updated'} successfully`, 'success');
            
            // Reload rules
            loadRules();
        })
        .catch(error => {
            console.error(`Error ${currentAction}ing rule:`, error);
            showToast(`Failed to ${currentAction} rule: ${error.message}`, 'danger');
        });
    }
    
    function openConditionModal(condition = null) {
        // Reset form
        document.getElementById('condition-topic').value = '';
        document.getElementById('condition-operator').value = 'equals';
        document.getElementById('condition-value').value = '';
        document.getElementById('condition-value-container').classList.remove('d-none');
        
        // If editing an existing condition
        if (condition) {
            document.getElementById('condition-topic').value = condition.topic;
            document.getElementById('condition-operator').value = condition.operator;
            
            if (condition.operator !== 'changes') {
                document.getElementById('condition-value').value = 
                    typeof condition.value === 'object' ? 
                    JSON.stringify(condition.value) : condition.value;
            } else {
                document.getElementById('condition-value-container').classList.add('d-none');
            }
            
            currentConditionIndex = condition.id;
        } else {
            currentConditionIndex = -1;
        }
        
        // Show the modal
        const modal = new bootstrap.Modal(conditionModal);
        modal.show();
    }
    
    function openActionModal(action = null) {
        // Reset form
        document.getElementById('action-type').value = 'publishMessage';
        document.getElementById('action-topic').value = '';
        document.getElementById('action-message-format').value = 'text';
        document.getElementById('action-message').value = '';
        document.getElementById('action-message-num').value = '';
        document.getElementById('action-notification-message').value = '';
        document.getElementById('action-command').value = '';
        document.getElementById('action-retain').checked = false;
        jsonEditor.set({});
        
        // Show the publish fields by default
        showActionFields('publishMessage');
        showMessageFormatFields('text');
        
        // If editing an existing action
        if (action) {
            document.getElementById('action-type').value = action.type;
            showActionFields(action.type);
            
            switch (action.type) {
                case 'publishMessage':
                    document.getElementById('action-topic').value = action.params.topic || '';
                    document.getElementById('action-retain').checked = action.params.retain || false;
                    
                    // Determine message format and set appropriate field
                    if (typeof action.params.message === 'object') {
                        document.getElementById('action-message-format').value = 'json';
                        showMessageFormatFields('json');
                        jsonEditor.set(action.params.message);
                    } else if (typeof action.params.message === 'number') {
                        document.getElementById('action-message-format').value = 'number';
                        showMessageFormatFields('number');
                        document.getElementById('action-message-num').value = action.params.message;
                    } else if (typeof action.params.message === 'boolean') {
                        document.getElementById('action-message-format').value = 'boolean';
                        showMessageFormatFields('boolean');
                        document.getElementById(action.params.message ? 'action-boolean-true' : 'action-boolean-false').checked = true;
                    } else {
                        document.getElementById('action-message-format').value = 'text';
                        showMessageFormatFields('text');
                        document.getElementById('action-message').value = action.params.message || '';
                    }
                    break;
                    
                case 'sendNotification':
                    document.getElementById('action-notification-message').value = action.params.message || '';
                    break;
                    
                case 'executeCommand':
                    document.getElementById('action-command').value = action.params.command || '';
                    break;
            }
            
            currentActionIndex = action.id;
        } else {
            currentActionIndex = -1;
        }
        
        // Show the modal
        const modal = new bootstrap.Modal(actionModal);
        modal.show();
    }
    
    function openDeleteModal(ruleId, ruleName) {
        currentRuleId = ruleId;
        deleteRuleName.textContent = ruleName;
        
        const modal = new bootstrap.Modal(deleteModal);
        modal.show();
    }
    
    function saveCondition() {
        const topic = document.getElementById('condition-topic').value;
        const operator = document.getElementById('condition-operator').value;
        let value = document.getElementById('condition-value').value;
        
        // Validate
        if (!topic) {
            showToast('Topic is required', 'danger');
            return;
        }
        
        if (operator !== 'changes' && !value) {
            showToast('Value is required', 'danger');
            return;
        }
        
        // Try to parse value if it looks like JSON
        if (value && (value.startsWith('{') || value.startsWith('[') || 
                     value === 'true' || value === 'false' || 
                     !isNaN(Number(value)))) {
            try {
                value = JSON.parse(value);
            } catch (e) {
                // Keep as string if parsing fails
            }
        }
        
        // Create condition object
        const condition = {
            id: currentConditionIndex !== -1 ? currentConditionIndex : crypto.randomUUID(),
            topic,
            operator,
            value: operator === 'changes' ? null : value
        };
        
        // Add to the conditions container
        const conditionElement = createEditableConditionElement(condition);
        
        // If editing, replace the old element
        if (currentConditionIndex !== -1) {
            const oldElement = conditionsContainer.querySelector(`[data-condition-id="${currentConditionIndex}"]`);
            if (oldElement) {
                oldElement.replaceWith(conditionElement);
            } else {
                conditionsContainer.appendChild(conditionElement);
            }
        } else {
            conditionsContainer.appendChild(conditionElement);
        }
        
        // Close the modal
        bootstrap.Modal.getInstance(conditionModal).hide();
    }
    
    function saveAction() {
        const actionType = document.getElementById('action-type').value;
        
        // Validate common fields
        if (!actionType) {
            showToast('Action type is required', 'danger');
            return;
        }
        
        // Create params object based on action type
        const params = {};
        
        switch (actionType) {
            case 'publishMessage':
                const topic = document.getElementById('action-topic').value;
                const format = document.getElementById('action-message-format').value;
                let message;
                
                if (!topic) {
                    showToast('Topic is required', 'danger');
                    return;
                }
                
                params.topic = topic;
                params.retain = document.getElementById('action-retain').checked;
                
                // Get message based on format
                switch (format) {
                    case 'text':
                        message = document.getElementById('action-message').value;
                        if (!message) {
                            showToast('Message is required', 'danger');
                            return;
                        }
                        break;
                        
                    case 'json':
                        try {
                            message = jsonEditor.get();
                        } catch (e) {
                            showToast('Invalid JSON: ' + e.message, 'danger');
                            return;
                        }
                        break;
                        
                    case 'number':
                        message = parseFloat(document.getElementById('action-message-num').value);
                        if (isNaN(message)) {
                            showToast('Invalid number', 'danger');
                            return;
                        }
                        break;
                        
                    case 'boolean':
                        message = document.getElementById('action-boolean-true').checked;
                        break;
                }
                
                params.message = message;
                break;
                
            case 'sendNotification':
                const notificationMessage = document.getElementById('action-notification-message').value;
                if (!notificationMessage) {
                    showToast('Notification message is required', 'danger');
                    return;
                }
                params.message = notificationMessage;
                break;
                
            case 'executeCommand':
                const command = document.getElementById('action-command').value;
                if (!command) {
                    showToast('Command is required', 'danger');
                    return;
                }
                params.command = command;
                break;
        }
        
        // Create action object
        const action = {
            id: currentActionIndex !== -1 ? currentActionIndex : crypto.randomUUID(),
            type: actionType,
            params
        };
        
        // Add to the actions container
        const actionElement = createEditableActionElement(action);
        
        // If editing, replace the old element
        if (currentActionIndex !== -1) {
            const oldElement = actionsContainer.querySelector(`[data-action-id="${currentActionIndex}"]`);
            if (oldElement) {
                oldElement.replaceWith(actionElement);
            } else {
                actionsContainer.appendChild(actionElement);
            }
        } else {
            actionsContainer.appendChild(actionElement);
        }
        
        // Close the modal
        bootstrap.Modal.getInstance(actionModal).hide();
    }
    
    function showActionFields(actionType) {
        // Hide all fields
        document.getElementById('action-publish-fields').classList.add('d-none');
        document.getElementById('action-notification-fields').classList.add('d-none');
        document.getElementById('action-command-fields').classList.add('d-none');
        
        // Show fields based on action type
        switch (actionType) {
            case 'publishMessage':
                document.getElementById('action-publish-fields').classList.remove('d-none');
                break;
                
            case 'sendNotification':
                document.getElementById('action-notification-fields').classList.remove('d-none');
                break;
                
            case 'executeCommand':
                document.getElementById('action-command-fields').classList.remove('d-none');
                break;
        }
    }
    
    function showMessageFormatFields(format) {
        // Hide all message fields
        document.getElementById('action-message-text').classList.add('d-none');
        document.getElementById('action-message-json').classList.add('d-none');
        document.getElementById('action-message-number').classList.add('d-none');
        document.getElementById('action-message-boolean').classList.add('d-none');
        
        // Show fields based on format
        switch (format) {
            case 'text':
                document.getElementById('action-message-text').classList.remove('d-none');
                break;
                
            case 'json':
                document.getElementById('action-message-json').classList.remove('d-none');
                break;
                
            case 'number':
                document.getElementById('action-message-number').classList.remove('d-none');
                break;
                
            case 'boolean':
                document.getElementById('action-message-boolean').classList.remove('d-none');
                break;
        }
    }
    
    function toggleRuleEnabled(ruleId, enabled) {
        const url = `/api/automation/rules/${ruleId}/${enabled ? 'enable' : 'disable'}`;
        
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // Update the rule in the local array
                const ruleIndex = rules.findIndex(r => r.id === ruleId);
                if (ruleIndex !== -1) {
                    rules[ruleIndex].enabled = enabled;
                }
                
                // Update UI
                const ruleCard = document.querySelector(`.rule-card[data-rule-id="${ruleId}"]`);
                if (ruleCard) {
                    if (enabled) {
                        ruleCard.classList.add('enabled');
                        ruleCard.classList.remove('disabled');
                    } else {
                        ruleCard.classList.add('disabled');
                        ruleCard.classList.remove('enabled');
                    }
                }
                
                // Show success message
                showToast(`Rule ${enabled ? 'enabled' : 'disabled'}`, 'success');
                
                // Add to history
                const ruleName = rules.find(r => r.id === ruleId)?.name || 'Unknown';
                addRuleToHistory(`Rule "${ruleName}" ${enabled ? 'enabled' : 'disabled'}`);
            }
        })
        .catch(error => {
            console.error(`Error ${enabled ? 'enabling' : 'disabling'} rule:`, error);
            showToast(`Failed to ${enabled ? 'enable' : 'disable'} rule: ${error.message}`, 'danger');
            
            // Reset the toggle to its previous state
            const toggle = document.querySelector(`.rule-enabled-toggle[data-rule-id="${ruleId}"]`);
            if (toggle) {
                toggle.checked = !enabled;
            }
        });
    }
    
    function deleteRule(ruleId) {
        fetch(`/api/automation/rules/${ruleId}`, {
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
                // Close the modal
                bootstrap.Modal.getInstance(deleteModal).hide();
                
                // Show success message
                showToast('Rule deleted successfully', 'success');
                
                // Reload rules
                loadRules();
            }
        })
        .catch(error => {
            console.error('Error deleting rule:', error);
            showToast(`Failed to delete rule: ${error.message}`, 'danger');
        });
    }
    
    function createExampleRule(exampleRule) {
        // Create a copy to avoid modifying the template
        const rule = JSON.parse(JSON.stringify(exampleRule));
        
        // Send to server
        fetch('/api/automation/rules', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(rule)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            showToast(`Example rule "${rule.name}" created successfully`, 'success');
            loadRules();
        })
        .catch(error => {
            console.error('Error creating example rule:', error);
            showToast(`Failed to create example rule: ${error.message}`, 'danger');
        });
    }
    
    function addRuleToHistory(message) {
        // Add to history
        const timestamp = new Date();
        history.unshift({
            message,
            timestamp
        });
        
        // Keep history limited to 50 items
        if (history.length > 50) {
            history.pop();
        }
        
        // Update UI
        updateHistoryUI();
    }
    
    function updateHistoryUI() {
        // Hide the no history message if we have history
        if (history.length > 0) {
            noHistoryMessage.classList.add('d-none');
        } else {
            noHistoryMessage.classList.remove('d-none');
            return;
        }
        
        // Clear existing history
        automationHistory.innerHTML = '';
        
        // Add history items
        history.forEach(item => {
            const div = document.createElement('div');
            div.className = 'rule-history-item';
            div.innerHTML = `
                <small class="text-muted">${formatDateTime(item.timestamp)}</small>
                <div>${item.message}</div>
            `;
            automationHistory.appendChild(div);
        });
    }
    
    function formatDateTime(timestamp) {
        if (!timestamp) return '';
        
        const date = new Date(timestamp);
        return date.toLocaleString();
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

    // Create and copy a quick link to the clipboard
    function createQuickLink(ruleId) {
        const rule = rules.find(r => r.id === ruleId);
        if (!rule) return;
        
        // Generate URL with rule ID
        const url = new URL(window.location.href);
        url.search = `?rule=${ruleId}`;
        const quickLink = url.toString();
        
        // Create shorter direct link (optional)
        const directLink = `${window.location.origin}/rule/${ruleId}`;
        
        // Copy to clipboard
        navigator.clipboard.writeText(directLink)
            .then(() => {
                showToast(`Quick link for "${rule.name}" copied to clipboard!`, 'success');
                // Save this rule to quick links
                saveQuickLink(ruleId, rule.name);
            })
            .catch(err => {
                console.error('Could not copy text: ', err);
                // Fallback for browsers that don't support clipboard API
                const tempInput = document.createElement('input');
                tempInput.value = directLink;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand('copy');
                document.body.removeChild(tempInput);
                showToast(`Quick link for "${rule.name}" copied to clipboard!`, 'success');
                // Save this rule to quick links
                saveQuickLink(ruleId, rule.name);
            });
    }
    
    // Save a quick link to localStorage
    function saveQuickLink(ruleId, ruleName) {
        // Get existing quick links
        let quickLinks = JSON.parse(localStorage.getItem('quickLinks') || '[]');
        
        // Check if this rule is already in quick links
        if (!quickLinks.some(link => link.id === ruleId)) {
            // Add this rule to quick links
            quickLinks.push({
                id: ruleId,
                name: ruleName,
                timestamp: Date.now()
            });
            
            // Only keep the latest 5 quick links
            if (quickLinks.length > 5) {
                quickLinks.sort((a, b) => b.timestamp - a.timestamp);
                quickLinks = quickLinks.slice(0, 5);
            }
            
            // Save back to localStorage
            localStorage.setItem('quickLinks', JSON.stringify(quickLinks));
            
            // Update the quick links display
            renderQuickLinks();
        }
    }
    
    // Render quick links from localStorage
    function renderQuickLinks() {
        // Get quick links
        const quickLinks = JSON.parse(localStorage.getItem('quickLinks') || '[]');
        
        // Clear container
        quickLinksContainer.innerHTML = '';
        
        // Show message if no quick links
        if (quickLinks.length === 0) {
            quickLinksContainer.appendChild(noQuickLinksMessage);
            return;
        }
        
        // Sort by most recent
        quickLinks.sort((a, b) => b.timestamp - a.timestamp);
        
        // Add each quick link
        quickLinks.forEach(link => {
            const linkElement = document.createElement('a');
            linkElement.href = `/rule/${link.id}`;
            linkElement.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
            
            // Create rule name with icon
            const nameSpan = document.createElement('span');
            nameSpan.innerHTML = `<i class="fas fa-bolt me-2"></i>${link.name}`;
            
            // Create remove button
            const removeButton = document.createElement('button');
            removeButton.className = 'btn btn-sm btn-outline-danger';
            removeButton.innerHTML = '<i class="fas fa-times"></i>';
            removeButton.setAttribute('data-rule-id', link.id);
            removeButton.title = 'Remove from quick links';
            
            // Add event listener to remove button
            removeButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                removeQuickLink(link.id);
            });
            
            // Add elements to link
            linkElement.appendChild(nameSpan);
            linkElement.appendChild(removeButton);
            
            // Add link to container
            quickLinksContainer.appendChild(linkElement);
        });
    }
    
    // Remove a quick link
    function removeQuickLink(ruleId) {
        // Get existing quick links
        let quickLinks = JSON.parse(localStorage.getItem('quickLinks') || '[]');
        
        // Filter out the one to remove
        quickLinks = quickLinks.filter(link => link.id !== ruleId);
        
        // Save back to localStorage
        localStorage.setItem('quickLinks', JSON.stringify(quickLinks));
        
        // Update the quick links display
        renderQuickLinks();
        
        showToast('Quick link removed', 'info');
    }
}); 