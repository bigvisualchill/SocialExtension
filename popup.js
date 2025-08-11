class SocialMediaAutomation {
    constructor() {
        this.initializeElements();
        this.bindEvents();
        this.loadSettings();
        this.updateStatus('Ready');
    }

    initializeElements() {
        this.platformSelect = document.getElementById('platform');
        this.delayInput = document.getElementById('delay');
        this.maxActionsInput = document.getElementById('maxActions');
        this.contentTopicInput = document.getElementById('contentTopic');
        this.toneInput = document.getElementById('tone');
        this.searchQueryInput = document.getElementById('searchQuery');
        this.includeTermsInput = document.getElementById('includeTermsInput');
        this.excludeTermsInput = document.getElementById('excludeTermsInput');
        this.useAiCheckbox = document.getElementById('useAi');
        this.logContainer = document.getElementById('logContainer');
        this.clearLogBtn = document.getElementById('clearLog');
        this.debugPageBtn = document.getElementById('debugPage');
        this.stopAutomationBtn = document.getElementById('stopAutomation');
        this.emergencyClearBtn = document.getElementById('emergencyClear');
        this.statusIndicator = document.getElementById('statusIndicator');
    }

    bindEvents() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.getAttribute('data-tab');
                document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
                document.getElementById(`panel-${tab}`).classList.add('active');
            });
        });

        // Action triggers
        const runCreate = document.getElementById('runCreatePost');
        const runRespond = document.getElementById('runRespond');
        const runSearch = document.getElementById('runSearchComment');
        const runFollow = document.getElementById('runFollow');
        runCreate.addEventListener('click', () => this.executeAction('createPost'));
        runRespond.addEventListener('click', () => this.executeAction('respondToComments'));
        runSearch.addEventListener('click', () => this.executeAction('searchAndComment'));
        runFollow.addEventListener('click', () => this.executeAction('followUsers'));
        this.clearLogBtn.addEventListener('click', () => this.clearLog());
        this.debugPageBtn.addEventListener('click', () => this.debugPage());
        this.stopAutomationBtn.addEventListener('click', () => this.stopAutomation());
        this.emergencyClearBtn.addEventListener('click', () => this.emergencyClear());
        
        // Save settings on change
        this.delayInput.addEventListener('change', () => this.saveSettings());
        this.maxActionsInput.addEventListener('change', () => this.saveSettings());
        this.searchQueryInput.addEventListener('change', () => this.saveSettings());
        this.includeTermsInput.addEventListener('change', () => this.saveSettings());
        this.excludeTermsInput.addEventListener('change', () => this.saveSettings());
        this.useAiCheckbox.addEventListener('change', () => this.saveSettings());
        this.contentTopicInput.addEventListener('change', () => this.saveSettings());
        this.toneInput.addEventListener('change', () => this.saveSettings());
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.local.get([
                'delay','maxActions','defaultSearchQuery','commentStyle','includeTerms','excludeTerms','useAi','openaiApiKey','assistantId','contentTopic','tone'
            ]);
            this.contentTopicInput.value = result.contentTopic || '';
            this.toneInput.value = result.tone || '';
            this.delayInput.value = result.delay || 1000;
            this.maxActionsInput.value = result.maxActions || 10;
            this.searchQueryInput.value = result.defaultSearchQuery || '';
            this.includeTermsInput.value = result.includeTerms || '';
            this.excludeTermsInput.value = result.excludeTerms || '';
            this.useAiCheckbox.checked = result.useAi ?? true;
        } catch (error) {
            this.log('Error loading settings: ' + error.message, 'error');
        }
    }

    async saveSettings() {
        try {
            await chrome.storage.local.set({
                delay: parseInt(this.delayInput.value),
                maxActions: parseInt(this.maxActionsInput.value),
                defaultSearchQuery: this.searchQueryInput.value,
                includeTerms: this.includeTermsInput.value,
                excludeTerms: this.excludeTermsInput.value,
                useAi: !!this.useAiCheckbox.checked,
                contentTopic: this.contentTopicInput.value,
                tone: this.toneInput.value
            });
        } catch (error) {
            this.log('Error saving settings: ' + error.message, 'error');
        }
    }

    async executeAction(action) {
        const platform = this.platformSelect.value;
        const settings = {
            delay: parseInt(this.delayInput.value),
            maxActions: parseInt(this.maxActionsInput.value),
            searchQuery: this.searchQueryInput.value,
            includeTerms: this.includeTermsInput.value,
            excludeTerms: this.excludeTermsInput.value,
            useAi: !!this.useAiCheckbox.checked,
            contentTopic: this.contentTopicInput.value,
            tone: this.toneInput.value
        };

        this.updateStatus('Running...');
        this.disableButtons();

        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                throw new Error('No active tab found');
            }

            // Check if we're on a supported platform
            const currentUrl = tab.url;
            const isSupportedPlatform = this.isSupportedPlatform(currentUrl, platform);
            
            if (!isSupportedPlatform) {
                throw new Error(`Please navigate to ${platform}.com first`);
            }

            this.log(`Starting ${action} on ${platform}...`, 'info');

            // Send message to content script
            let response;
            try {
                response = await chrome.tabs.sendMessage(tab.id, {
                    action: action,
                    platform: platform,
                    settings: settings
                });
            } catch (e) {
                // Fallback: inject content script then retry
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                response = await chrome.tabs.sendMessage(tab.id, {
                    action: action,
                    platform: platform,
                    settings: settings
                });
            }

            if (response && response.success) {
                this.log(`Successfully started ${action}`, 'success');
            } else {
                throw new Error(response?.error || 'Unknown error occurred');
            }

        } catch (error) {
            this.log(`Error: ${error.message}`, 'error');
            this.updateStatus('Error');
        } finally {
            this.enableButtons();
            setTimeout(() => this.updateStatus('Ready'), 2000);
        }
    }

    isSupportedPlatform(url, platform) {
        const platformUrls = {
            facebook: 'facebook.com',
            twitter: 'twitter.com',
            instagram: 'instagram.com',
            linkedin: 'linkedin.com',
            youtube: 'youtube.com'
        };
        
        return url.includes(platformUrls[platform]);
    }

    updateStatus(status) {
        const statusText = this.statusIndicator.querySelector('.status-text');
        const statusDot = this.statusIndicator.querySelector('.status-dot');
        
        statusText.textContent = status;
        
        // Update status dot color
        statusDot.style.background = status === 'Ready' ? '#27ae60' : 
                                   status === 'Running...' ? '#f39c12' : 
                                   status === 'Error' ? '#e74c3c' : '#27ae60';
    }

    disableButtons() {
        const buttons = document.querySelectorAll('.action-btn');
        buttons.forEach(btn => btn.disabled = true);
    }

    enableButtons() {
        const buttons = document.querySelectorAll('.action-btn');
        buttons.forEach(btn => btn.disabled = false);
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        this.logContainer.appendChild(logEntry);
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
        
        // Keep only last 50 log entries
        while (this.logContainer.children.length > 50) {
            this.logContainer.removeChild(this.logContainer.firstChild);
        }
    }

    clearLog() {
        this.logContainer.innerHTML = '';
    }

    async debugPage() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                this.log('No active tab found', 'error');
                return;
            }

            this.log('Starting page debug...', 'info');
            let response;
            try {
                response = await chrome.tabs.sendMessage(tab.id, { action: 'debug' });
            } catch (e) {
                // Inject and retry
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                response = await chrome.tabs.sendMessage(tab.id, { action: 'debug' });
            }

            if (response && response.success) {
                this.log('Debug completed - check console for details', 'success');
            } else {
                this.log('Debug failed', 'error');
            }

        } catch (error) {
            this.log(`Debug error: ${error.message}`, 'error');
        }
    }

    async stopAutomation() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                this.log('No active tab found', 'error');
                return;
            }

            this.log('Stopping automation...', 'info');

            try {
                await chrome.tabs.sendMessage(tab.id, { action: 'stop' });
            } catch (e) {
                // Content script might not be loaded, just clear storage
                await chrome.storage.local.remove(['pendingTask']);
            }

            this.log('Automation stopped', 'success');

        } catch (error) {
            this.log(`Stop error: ${error.message}`, 'error');
        }
    }

    async emergencyClear() {
        try {
            this.log('🚨 Emergency Clear: Removing all automation data...', 'warning');
            
            // Clear all automation-related storage
            await chrome.storage.local.remove([
                'pendingTask',
                'automationState',
                'videoUrls',
                'currentIndex',
                'processedUrls'
            ]);
            
            // Try to stop any running automation on all tabs
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                if (tab.url && (
                    tab.url.includes('youtube.com') ||
                    tab.url.includes('facebook.com') ||
                    tab.url.includes('twitter.com') ||
                    tab.url.includes('instagram.com') ||
                    tab.url.includes('linkedin.com')
                )) {
                    try {
                        await chrome.tabs.sendMessage(tab.id, { action: 'stop' });
                    } catch (e) {
                        // Content script might not be loaded
                    }
                }
            }
            
            this.log('✅ Emergency clear completed. All automation stopped.', 'success');
            
        } catch (error) {
            this.log(`Emergency clear error: ${error.message}`, 'error');
        }
    }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'log') {
        // This would be handled by the popup if it's open
        console.log(`[Content Script] ${message.message}`);
    }
});

// Initialize the automation when popup loads
document.addEventListener('DOMContentLoaded', () => {
    new SocialMediaAutomation();
});
