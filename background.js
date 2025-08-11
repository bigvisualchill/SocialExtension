// Background service worker for Social Media Automation extension

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Social Media Automation extension installed');
        
        // Set default settings
        chrome.storage.local.set({
            delay: 1000,
            maxActions: 10,
            enabled: true
        });
    }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    console.log('Social Media Automation extension started');
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // AI: Generate comment via OpenAI Assistants API
    if (message.type === 'ai.generateComment') {
        (async () => {
            try {
                const { postText, context, style } = message;
                const { openaiApiKey, assistantId, useAssistantsApi } = await chrome.storage.local.get(['openaiApiKey','assistantId','useAssistantsApi']);
                if (!openaiApiKey || !assistantId) {
                    sendResponse({ success: false, error: 'Missing API key or assistant ID in Options' });
                    return;
                }

                if (useAssistantsApi) {
                    const text = await runAssistantJson(openaiApiKey, assistantId, {
                        task: 'comment',
                        context,
                        postText,
                        style
                    });
                    sendResponse({ success: true, text });
                } else {
                    const prompt = `Task: Generate a social media comment. Style: ${style || 'concise, positive'}.\nPost: "${postText}".\nContext: ${context || ''}.\nReturn ONLY JSON of the form {"reasoning":"1-2 sentence summary (no chain-of-thought)","completion":"<comment>","clarifications_needed":""}. Do not include hidden thoughts.`;
                    const res = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${openaiApiKey}`
                        },
                        body: JSON.stringify({
                            model: 'gpt-4o-mini',
                            messages: [
                                { role: 'system', content: 'You produce JSON with a brief reasoning summary (no chain-of-thought) and a completion. Never reveal internal step-by-step thoughts.' },
                                { role: 'user', content: prompt }
                            ],
                            temperature: 0.6,
                            max_tokens: 220
                        })
                    });
                    const data = await res.json();
                    const content = data?.choices?.[0]?.message?.content?.trim();
                    let completionText = null;
                    try {
                        const json = JSON.parse(content);
                        completionText = json?.completion?.trim() || null;
                    } catch {}
                    const text = completionText || content;
                    if (!text) throw new Error(data.error?.message || 'No AI text');
                    sendResponse({ success: true, text });
                }
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    if (message.type === 'log') {
        // Forward logs to popup if open
        chrome.runtime.sendMessage(message).catch(() => {
            // Popup might not be open, ignore error
        });
    }
    
    // Handle other message types as needed
    if (message.type === 'getSettings') {
        chrome.storage.local.get(['delay', 'maxActions', 'enabled'], (result) => {
            sendResponse(result);
        });
        return true; // Keep message channel open
    }
    
    if (message.type === 'updateSettings') {
        chrome.storage.local.set(message.settings, () => {
            sendResponse({ success: true });
        });
        return true; // Keep message channel open
    }
});

// Helpers: Assistants API JSON runner
async function runAssistantJson(apiKey, assistantId, payload) {
    // Create thread
    const threadRes = await fetch('https://api.openai.com/v1/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({})
    });
    const thread = await threadRes.json();
    if (!thread?.id) throw new Error('Failed to create thread');

    // Compose user content with schema and safety
    const userContent = [
        'You are a social media assistant integrated with a Chrome extension.',
        'Output must be JSON with keys: reasoning, completion, clarifications_needed.',
        'Reasoning must be a brief high-level summary (1-2 sentences). Do not include chain-of-thought.',
        'Persist until clarifications are resolved; if missing info, put questions under clarifications_needed and leave completion empty.',
        `Task payload: ${JSON.stringify(payload)}`
    ].join('\n');

    // Add message
    await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
            role: 'user',
            content: userContent
        })
    });

    // Run assistant
    const runRes = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ assistant_id: assistantId })
    });
    const run = await runRes.json();
    if (!run?.id) throw new Error('Failed to start run');

    // Poll
    let status = run.status;
    let attempts = 0;
    while (status !== 'completed' && status !== 'failed' && attempts < 30) {
        await new Promise(r => setTimeout(r, 1000));
        const rs = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const rj = await rs.json();
        status = rj.status;
        attempts++;
    }
    if (status !== 'completed') throw new Error(`Run did not complete: ${status}`);

    // Get messages
    const msgsRes = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const msgs = await msgsRes.json();
    const first = msgs?.data?.find(m => m.role === 'assistant');
    const text = first?.content?.[0]?.text?.value || '';
    try {
        const json = JSON.parse(text);
        const completion = json?.completion?.trim();
        if (completion) return completion;
    } catch {}
    return text.trim();
}

// Handle tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Check if the tab is on a supported social media platform
        const supportedPlatforms = [
            'facebook.com',
            'twitter.com',
            'instagram.com',
            'linkedin.com',
            'youtube.com'
        ];
        
        const isSupported = supportedPlatforms.some(platform => 
            tab.url.includes(platform)
        );
        
        if (isSupported) {
            // Content script will be automatically injected via manifest
            console.log(`Detected supported platform: ${tab.url}`);
        }
    }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    // This will open the popup automatically due to manifest configuration
    console.log('Extension icon clicked');
});

// Handle keyboard shortcuts (if available)
if (chrome.commands && chrome.commands.onCommand) {
    chrome.commands.onCommand.addListener((command) => {
        console.log(`Command received: ${command}`);
        
        switch (command) {
            case 'toggle-automation':
                chrome.storage.local.get(['enabled'], (result) => {
                    const newState = !result.enabled;
                    chrome.storage.local.set({ enabled: newState });
                    console.log(`Automation ${newState ? 'enabled' : 'disabled'}`);
                });
                break;
            case 'quick-post':
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: 'createPost',
                            platform: 'auto',
                            settings: { delay: 1000, maxActions: 1 }
                        });
                    }
                });
                break;
        }
    });
} else {
    console.log('Commands API not available in this context');
}

// Handle storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        console.log('Settings changed:', changes);
        
        // Notify content scripts of setting changes
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                if (tab.url && (
                    tab.url.includes('facebook.com') ||
                    tab.url.includes('twitter.com') ||
                    tab.url.includes('instagram.com') ||
                    tab.url.includes('linkedin.com') ||
                    tab.url.includes('youtube.com')
                )) {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'settingsChanged',
                        changes: changes
                    }).catch(() => {
                        // Content script might not be loaded yet
                    });
                }
            });
        });
    }
});

// Handle context menu (optional)
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'socialMediaAutomation',
        title: 'Social Media Automation',
        contexts: ['page'],
        documentUrlPatterns: [
            '*://*.facebook.com/*',
            '*://*.twitter.com/*',
            '*://*.instagram.com/*',
            '*://*.linkedin.com/*',
            '*://*.youtube.com/*'
        ]
    });
    
    chrome.contextMenus.create({
        id: 'createPost',
        parentId: 'socialMediaAutomation',
        title: 'Create Post',
        contexts: ['page']
    });
    
    chrome.contextMenus.create({
        id: 'respondToComments',
        parentId: 'socialMediaAutomation',
        title: 'Respond to Comments',
        contexts: ['page']
    });
    
    chrome.contextMenus.create({
        id: 'searchAndComment',
        parentId: 'socialMediaAutomation',
        title: 'Search & Comment',
        contexts: ['page']
    });
    
    chrome.contextMenus.create({
        id: 'followUsers',
        parentId: 'socialMediaAutomation',
        title: 'Follow Users',
        contexts: ['page']
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'createPost') {
        chrome.tabs.sendMessage(tab.id, {
            action: 'createPost',
            platform: 'auto',
            settings: { delay: 1000, maxActions: 1 }
        });
    } else if (info.menuItemId === 'respondToComments') {
        chrome.tabs.sendMessage(tab.id, {
            action: 'respondToComments',
            platform: 'auto',
            settings: { delay: 1000, maxActions: 5 }
        });
    } else if (info.menuItemId === 'searchAndComment') {
        chrome.tabs.sendMessage(tab.id, {
            action: 'searchAndComment',
            platform: 'auto',
            settings: { delay: 1000, maxActions: 3 }
        });
    } else if (info.menuItemId === 'followUsers') {
        chrome.tabs.sendMessage(tab.id, {
            action: 'followUsers',
            platform: 'auto',
            settings: { delay: 1000, maxActions: 5 }
        });
    }
});

// Keep service worker alive
chrome.runtime.onSuspend.addListener(() => {
    console.log('Social Media Automation extension suspended');
});
